"use server";

import {
  CountryCode,
} from "plaid";

import { plaidClient } from "../plaid";
import { decryptId, parseStringify } from "../utils";

import { getTransactionsByBankId, createTransaction } from "./transaction.actions";
import { getBanks, getBank, getBankByAccountId, getLoggedInUser } from "./user.actions";
import { createTransfer } from "./dwolla.actions";

// Get multiple bank accounts
export const getAccounts = async ({ userId }: getAccountsProps) => {
  try {
    // get banks from db
    const banks = await getBanks({ userId });

    const accounts = await Promise.all(
      banks?.map(async (bank: Bank) => {
        // get each account info from plaid
        const accountsResponse = await plaidClient.accountsGet({
          access_token: bank.accessToken,
        });
        const accountData = accountsResponse.data.accounts[0];

        // get institution info from plaid
        const institution = await getInstitution({
          institutionId: accountsResponse.data.item.institution_id!,
        });

        const account = {
          id: accountData.account_id,
          availableBalance: accountData.balances.available!,
          currentBalance: accountData.balances.current!,
          institutionId: institution.institution_id,
          name: accountData.name,
          officialName: accountData.official_name,
          mask: accountData.mask!,
          type: accountData.type as string,
          subtype: accountData.subtype! as string,
          appwriteItemId: bank.$id,
          sharableId: bank.sharableId,
        };

        return account;
      })
    );

    const totalBanks = accounts.length;
    const totalCurrentBalance = accounts.reduce((total, account) => {
      return total + account.currentBalance;
    }, 0);

    return parseStringify({ data: accounts, totalBanks, totalCurrentBalance });
  } catch (error) {
    console.error("An error occurred while getting the accounts:", error);
  }
};

// Get one bank account
export const getAccount = async ({ appwriteItemId }: getAccountProps) => {
  try {
    // get bank from db
    const bank = await getBank({ documentId: appwriteItemId });

    // get account info from plaid
    const accountsResponse = await plaidClient.accountsGet({
      access_token: bank.accessToken,
    });
    const accountData = accountsResponse.data.accounts[0];

    // get transfer transactions from appwrite
    const transferTransactionsData = await getTransactionsByBankId({
      bankId: bank.$id,
    });

    const transferTransactions = transferTransactionsData.documents.map(
      (transferData: Transaction) => ({
        id: transferData.$id,
        name: transferData.name!,
        amount: transferData.amount!,
        date: transferData.$createdAt,
        paymentChannel: transferData.channel,
        category: transferData.category,
        type: transferData.senderBankId === bank.$id ? "debit" : "credit",
      })
    );

    // get institution info from plaid
    const institution = await getInstitution({
      institutionId: accountsResponse.data.item.institution_id!,
    });

    const transactions = await getTransactions({
      accessToken: bank?.accessToken,
    });

    const account = {
      id: accountData.account_id,
      availableBalance: accountData.balances.available!,
      currentBalance: accountData.balances.current!,
      institutionId: institution.institution_id,
      name: accountData.name,
      officialName: accountData.official_name,
      mask: accountData.mask!,
      type: accountData.type as string,
      subtype: accountData.subtype! as string,
      appwriteItemId: bank.$id,
    };
    // console.log("transactions done by me=",transferTransactions);
    // sort transactions by date such that the most recent transaction is first
    // const allTransactions = [...transactions].sort(
      const allTransactions = [...transactions, ...transferTransactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return parseStringify({
      data: account,
      transactions: allTransactions,
    });
  } catch (error) {
    console.error("An error occurred while getting the account:", error);
  }
};


// Get bank info
export const getInstitution = async ({
  institutionId,
}: getInstitutionProps) => {
  try {
    const institutionResponse = await plaidClient.institutionsGetById({
      institution_id: institutionId,
      country_codes: ["US"] as CountryCode[],
    });

    const intitution = institutionResponse.data.institution;

    return parseStringify(intitution);
  } catch (error) {
    console.error("An error occurred while getting the accounts:", error);
  }
};

// // Get transactions
// export const getTransactions = async ({
//   accessToken,
// }: getTransactionsProps) => {
//   let hasMore = true;
//   let transactions: any = [];

//   try {
//     // Iterate through each page of new transaction updates for item
//     while (hasMore) {
//       const response = await plaidClient.transactionsSync({
//         access_token: accessToken,
//       });

//       const data = response.data;

//       transactions = response.data.added.map((transaction) => ({
//         id: transaction.transaction_id,
//         name: transaction.name,
//         paymentChannel: transaction.payment_channel,
//         type: transaction.payment_channel,
//         accountId: transaction.account_id,
//         amount: transaction.amount,
//         pending: transaction.pending,
//         category: transaction.category ? transaction.category[0] : "",
//         date: transaction.date,
//         image: transaction.logo_url,
//       }));

//       hasMore = data.has_more;
//     }

//     return parseStringify(transactions);
//   } catch (error) {
//     console.error("An error occurred while getting the accounts:", error);
//   }
// };

type PlaidTransaction = {
  id: string;
  name: string;
  paymentChannel: string;
  type: string;
  accountId: string;
  amount: number;
  pending: boolean;
  category: string;
  date: string;
  image: string;
};

export const getTransactions = async ({accessToken}: getTransactionsProps) => {
  let hasMore = true;
  let transactions: PlaidTransaction[] = [];

  try {
    // Iterate through each page of new transaction updates for item
    while (hasMore) {
      const response = await plaidClient.transactionsSync({
        access_token: accessToken,
      });

      const data = response.data;

      transactions = transactions.concat(
        response.data.added.map((transaction) => ({
          id: transaction.transaction_id || 'unknown-id',
          name: transaction.name || 'Unknown Name',
          paymentChannel: transaction.payment_channel || 'Unknown Channel',
          type: transaction.payment_channel || 'Unknown Type',
          accountId: transaction.account_id || 'unknown-account',
          amount: transaction.amount || 0,
          pending: transaction.pending || false,
          category: transaction.category
            ? transaction.category[0]
            : 'Uncategorized',
          date: transaction.date || new Date().toISOString(),
          image: transaction.logo_url || '',
        }))
      );
      hasMore = data.has_more;
    }

    if (transactions.length === 0) {
      return parseStringify([]);
    }
    return parseStringify(transactions);
  } catch (error) {
    console.error('An error occurred while getting the transactions:', error);
  }
};

type TransferFundsParams = {
  senderBankId: string;
  sharableId: string;
  amount: string;
  name: string;
  email: string;
};

// Performs a full funds transfer entirely server-side. This is the only
// entry point the client should use for transfers: it never returns bank
// documents, Plaid access tokens, or Dwolla funding source URLs back to the
// browser, and it verifies the sender bank actually belongs to the
// currently authenticated user before moving any money.
export const transferFunds = async ({
  senderBankId,
  sharableId,
  amount,
  name,
  email,
}: TransferFundsParams) => {
  try {
    const loggedInUser = await getLoggedInUser();
    if (!loggedInUser) {
      throw new Error("You must be signed in to make a transfer.");
    }

    const senderBank = await getBank({ documentId: senderBankId });
    if (!senderBank) {
      throw new Error("We couldn't find the selected source bank account.");
    }

    // Authorization check: the sender bank must belong to the logged-in user.
    // Without this, a client could submit any bank's document id and move
    // funds out of an account that isn't theirs.
    const senderBankOwnerId =
      typeof senderBank.userId === "string" ? senderBank.userId : senderBank.userId?.$id;
    if (senderBankOwnerId !== loggedInUser.$id) {
      throw new Error("You can only transfer from your own bank accounts.");
    }

    const receiverAccountId = decryptId(sharableId);
    const receiverBank = await getBankByAccountId({ accountId: receiverAccountId });
    if (!receiverBank) {
      throw new Error("We couldn't find a bank account for that sharable ID.");
    }

    const transfer = await createTransfer({
      sourceFundingSourceUrl: senderBank.fundingSourceUrl,
      destinationFundingSourceUrl: receiverBank.fundingSourceUrl,
      amount,
    });

    if (!transfer) {
      throw new Error("The transfer couldn't be completed. Please try again.");
    }

    const newTransaction = await createTransaction({
      name,
      amount,
      senderId: senderBankOwnerId,
      senderBankId: senderBank.$id,
      receiverId:
        typeof receiverBank.userId === "string" ? receiverBank.userId : receiverBank.userId?.$id,
      receiverBankId: receiverBank.$id,
      email,
    });

    if (!newTransaction) {
      throw new Error("The transfer went through, but we couldn't record the transaction.");
    }

    // Only a minimal, non-sensitive success result crosses back to the client.
    return { success: true };
  } catch (error) {
    console.error("An error occurred while transferring funds:", error);
    throw error instanceof Error
      ? error
      : new Error("Something went wrong while submitting your transfer.");
  }
};