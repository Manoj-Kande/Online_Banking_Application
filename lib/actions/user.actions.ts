"use server";

import { ID, Query } from "node-appwrite";
import { createAdminClient, createSessionClient } from "../appwrite";
import { cookies } from "next/headers";
import { encryptId, extractCustomerIdFromUrl, parseStringify } from "../utils";
import { CountryCode, ProcessorTokenCreateRequest, ProcessorTokenCreateRequestProcessorEnum, Products } from "plaid";
import { plaidClient } from "../plaid";
import { revalidatePath } from "next/cache";
import { addFundingSource, checkDwollaCustomerEmailExists, createDwollaCustomer } from "./dwolla.actions";
import { isRateLimited, recordFailure, resetAttempts } from "../rate-limit";



const {
  APPWRITE_DATABASE_ID:DATABASE_ID,
  APPWRITE_USER_COLLECTION_ID:USER_COLLECTION_ID,
  APPWRITE_BANK_COLLECTION_ID:BANK_COLLECTION_ID,
} = process.env;


// Removes fields that should never be serialized back to the browser.
// This document also holds the user's SSN and date of birth (needed only for
// the one-time Dwolla KYC call at sign-up), which must never round-trip to
// client-side React state, page payloads, or devtools.
const sanitizeUserForClient = (user: Record<string, unknown> | undefined) => {
  if (!user) return user;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ssn, dateOfBirth, ...safeUser } = user;
  return safeUser;
};

export const getUserInfo = async ({ userId }: getUserInfoProps) => {
  try {
    const { database } = await createAdminClient();

    const user = await database.listDocuments(
      DATABASE_ID!,
      USER_COLLECTION_ID!,
      [Query.equal('userId', [userId])]
    )

    return parseStringify(sanitizeUserForClient(user.documents[0]));
  } catch (error) {
    console.log(error)
  }
}

export const signIn = async ({email,password}:signInProps) => {
  const rateLimitKey = `sign-in:${email.trim().toLowerCase()}`;

  if (isRateLimited(rateLimitKey)) {
    throw new Error("Too many sign-in attempts. Please wait a few minutes and try again.");
  }

  try {
    const { account } = await createAdminClient();
    const session = await account.createEmailPasswordSession(email, password);

    (await cookies()).set("appwrite-session", session.secret, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: true,
    });

    const user = await getUserInfo({userId:session.userId});

    resetAttempts(rateLimitKey);
    return parseStringify(user);
  } catch (error: unknown) {
    recordFailure(rateLimitKey);
    console.log("Error", error);
    // Surface a friendly, specific message to the client instead of swallowing it
    const appwriteError = error as { type?: string; code?: number; message?: string };

    let message: string;
    if (appwriteError?.type === "user_invalid_credentials" || appwriteError?.code === 401) {
      // Deliberately generic: don't reveal whether the email exists at all.
      message = "Invalid email or password. Please try again.";
    } else if (appwriteError?.type === "user_blocked") {
      message = "This account has been blocked. Please contact support.";
    } else if (appwriteError?.type === "general_rate_limit_exceeded" || appwriteError?.code === 429) {
      message = "Too many attempts. Please wait a moment and try again.";
    } else {
      message = appwriteError?.message || "Something went wrong while signing in.";
    }

    throw new Error(message);
  }
};

export const signUp = async ({password,...userData}: SignUpParams) => {
    
    const {email,firstName,lastName}=userData;
    
    let newUserAccount;
    
    try {
    // Fail fast: if this email is already tied to a Dwolla customer
    // (including a suspended one - Dwolla never truly frees these up), stop
    // here rather than creating an Appwrite account we'd only have to roll
    // back a moment later.
    const emailTakenOnDwolla = await checkDwollaCustomerEmailExists(email);
    if (emailTakenOnDwolla) {
      throw new Error(
        "This email is already registered with our banking partner (Dwolla) from a previous sign-up attempt. Please use a different email address."
      );
    }

    const { account,database } = await createAdminClient();

     newUserAccount = await account.create(
      ID.unique(),
      email,
      password,
      `${firstName} ${lastName}`
    );

    if(!newUserAccount) throw new Error('Error creating user');

    const dwollaCustomerUrl= await createDwollaCustomer({
      ...userData,
      type:'personal'
    });

    if(!dwollaCustomerUrl) throw new Error("Error creating Dwolla customer. Please check your details and try again.")

    const dwollaCustomerId = extractCustomerIdFromUrl(dwollaCustomerUrl);

    const newUser= await database.createDocument(
      DATABASE_ID!,
      USER_COLLECTION_ID!,
      ID.unique(),
      {
        ...userData,
        userId:newUserAccount.$id,
        dwollaCustomerId,
        dwollaCustomerUrl,

      }
    )
    const session = await account.createEmailPasswordSession(email, password);

    (await cookies()).set("appwrite-session", session.secret, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: true,
    });

    return parseStringify(sanitizeUserForClient(newUser));
  } catch (error: unknown) {
    console.log("Error", error);

    // If the Appwrite auth account was created but a later step (Dwolla,
    // saving the user document) failed, roll it back. Otherwise the account
    // is orphaned - it has no matching database document or Dwolla
    // customer, but Appwrite will still reject a retry with the same email
    // as "already exists", leaving the user stuck.
    if (newUserAccount?.$id) {
      try {
        const { user } = await createAdminClient();
        await user.delete(newUserAccount.$id);
      } catch (cleanupError) {
        console.log("Failed to roll back orphaned Appwrite account:", cleanupError);
      }
    }

    // Re-throw with a user-friendly message so the UI can show a toast
    const appwriteError = error as { type?: string; code?: number; message?: string };
    throw new Error(
      appwriteError?.code === 409 || appwriteError?.type === "user_already_exists"
        ? "An account with this email already exists. Please sign in instead."
        : appwriteError?.message || "Something went wrong while creating your account."
    );
  }
};

// ... your initilization functions

export async function getLoggedInUser() {
  try {
    const { account } = await createSessionClient();
    const result= await account.get();
    const user = await getUserInfo({userId:result.$id});
    return parseStringify(user);
  } catch (error) {
    console.log(error);
    return null;
  }
}

export const  logoutAccount = async ()=>{
    try {
    const { account } = await createAdminClient();
        (await cookies()).delete('appwrite-session');
        await account.deleteSession('current');
        return true;
    } catch (error) {
        console.log(error);
        return false;
    }
}

// export const createLinkToken = async (user: User) => {
//   try {
//     const tokenParams = {
//       user: {
//         client_user_id: user.$id,
//       },
//       client_name: `${user.firstName} ${user.lastName}`,
//       products: [Products.Auth, Products.Transactions],
//       language: 'en',
//       country_codes: ['US'] as CountryCode[],
//     }

//     const response = await plaidClient.linkTokenCreate(tokenParams);

//     return parseStringify({ linkToken: response.data.link_token })
//   } catch (error) {
//     console.log(error);
//   }
// }

export const createLinkToken = async (user: User) => {
  try {
    // Create a link token PARAMS
    const tokenParams = {
      client_name: `${user.firstName} ${user.lastName}`,
      products: [Products.Auth, Products.Transactions],

      country_codes: [CountryCode.Us],
      language: 'en',
      user: {
        client_user_id: user.$id,
      },
    };
    const response = await plaidClient.linkTokenCreate(tokenParams);
    return parseStringify({linkToken: response.data.link_token});
  } catch (error) {
    console.error('Error creating link token:', error);
    const plaidError = error as { response?: { data?: { error_message?: string } }; message?: string };
    throw new Error(
      plaidError?.response?.data?.error_message ||
        plaidError?.message ||
        "We couldn't set up bank linking right now. Please try again shortly."
    );
  }
};

export const createBankAccount = async ({
    userId,
    bankId,
    accountId,
    accessToken,
    fundingSourceUrl,
    sharableId,
}:createBankAccountProps)=>{
  try {
    
    const {database} = await createAdminClient();

    const bankAccount= await database.createDocument(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      ID.unique(),
      {
        userId,
        bankId,
        accountId,
        accessToken,
        fundingSourceUrl,
        sharableId,
      }
    )
    return parseStringify(bankAccount)
  } catch (error) {
    console.log(error);
    throw new Error("We linked your bank with Plaid, but couldn't save the account. Please try again.");
  }
}

export const exchangePublicToken = async ({
  publicToken,
  user,
}:exchangePublicTokenProps)=>{
  try {
    const response = await plaidClient.itemPublicTokenExchange({
      public_token:publicToken,
    });

    const accessToken = response.data.access_token;
    const itemId = response.data.item_id;
    
    // Get account information from Plaid using the access token
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    const accountData = accountsResponse.data.accounts[0];

    // Create a processor token for Dwolla using the access token and account ID
    const request: ProcessorTokenCreateRequest = {
      access_token: accessToken,
      account_id: accountData.account_id,
      processor: "dwolla" as ProcessorTokenCreateRequestProcessorEnum,
    };

    const processorTokenResponse = await plaidClient.processorTokenCreate(request);
    const processorToken = processorTokenResponse.data.processor_token;

     // Create a funding source URL for the account using the Dwolla customer ID, processor token, and bank name
     const fundingSourceUrl = await addFundingSource({
      dwollaCustomerId: user.dwollaCustomerId,
      processorToken,
      bankName: accountData.name,
    });
    
    // If the funding source URL is not created, throw an error
    if (!fundingSourceUrl) {
      throw new Error("We couldn't connect that bank account. Please try again.");
    }

    // Create a bank account using the user ID, item ID, account ID, access token, funding source URL, and shareableId ID
    await createBankAccount({
      userId: user.$id,
      bankId: itemId,
      accountId: accountData.account_id,
      accessToken,
      fundingSourceUrl,
      sharableId: encryptId(accountData.account_id),
    });

    // Revalidate the path to reflect the changes
    revalidatePath("/");

    // Return a success message
    return parseStringify({
      publicTokenExchange: "complete",
    });

  } catch (error) {
    console.log("An error occurred while creating exchange token:"
      ,error);
    throw error instanceof Error
      ? error
      : new Error("Something went wrong while linking your bank account.");
  }
}

// This function exchanges a public token for an access token and item ID


export const getBanks = async ({ userId }: getBanksProps) => {
  try {
    const { database } = await createAdminClient();

    const banks = await database.listDocuments(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      [Query.equal('userId', [userId])]
    )

    return parseStringify(banks.documents);
  } catch (error) {
    console.log(error)
  }
}

export const getBank = async ({ documentId }: getBankProps) => {
  try {
    const { database } = await createAdminClient();

    const bank = await database.listDocuments(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      [Query.equal('$id', [documentId])]
    )

    return parseStringify(bank.documents[0]);
  } catch (error) {
    console.log(error)
  }
}


export const getBankByAccountId = async ({ accountId }: getBankByAccountIdProps) => {
  try {
    const { database } = await createAdminClient();

    const bank = await database.listDocuments(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      [Query.equal('accountId', [accountId])]
    )
    if(bank.total!==1){
      return null;
    }
    return parseStringify(bank.documents[0]);
  } catch (error) {
    console.log(error)
  }
}