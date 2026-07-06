"use server";

import { Client } from "dwolla-v2";

const getEnvironment = (): "production" | "sandbox" => {
  const environment = process.env.DWOLLA_ENV as string;

  switch (environment) {
    case "sandbox":
      return "sandbox";
    case "production":
      return "production";
    default:
      throw new Error(
        "Dwolla environment should either be set to `sandbox` or `production`"
      );
  }
};

const dwollaClient = new Client({
  environment: getEnvironment(),
  key: process.env.DWOLLA_KEY as string,
  secret: process.env.DWOLLA_SECRET as string,
});

// dwolla-v2 attaches the parsed API response body to `err.body` on failure.
// For validation errors this body looks like:
//   {
//     code: "ValidationError",
//     message: "Validation error(s) present...",
//     _embedded: { errors: [{ message: "State must be a 2-letter abbreviation.", path: "/state" }] }
//   }
// Without this, callers only ever saw a generic "something went wrong"
// message and the actual, actionable reason was lost.
type DwollaErrorBody = {
  code?: string;
  message?: string;
  _embedded?: { errors?: { message?: string; path?: string }[] };
};

const getDwollaErrorMessage = (err: unknown): string => {
  const body = (err as { body?: DwollaErrorBody })?.body;

  const fieldErrors = body?._embedded?.errors
    ?.map((e) => e.message)
    .filter(Boolean);

  if (fieldErrors && fieldErrors.length > 0) {
    const combined = fieldErrors.join(" ");

    // Dwolla customers can only be suspended, never truly deleted - so an
    // email used previously (even for a since-removed account) will still
    // be rejected as a duplicate. Make that non-obvious situation clear
    // instead of just repeating Dwolla's generic-sounding wording.
    if (/customer with the specified email already exists/i.test(combined)) {
      return "This email is already registered with our banking partner (Dwolla) from a previous sign-up attempt. Please use a different email address.";
    }

    return combined;
  }

  if (body?.message) return body.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong while contacting Dwolla.";
};

// Create a Dwolla Funding Source using a Plaid Processor Token
export const createFundingSource = async (
  options: CreateFundingSourceOptions
) => {
  try {
    return await dwollaClient
      .post(`customers/${options.customerId}/funding-sources`, {
        name: options.fundingSourceName,
        plaidToken: options.plaidToken,
      })
      .then((res) => res.headers.get("location"));
  } catch (err) {
    console.error("Creating a Funding Source Failed: ", err);
    throw new Error(getDwollaErrorMessage(err));
  }
};

export const createOnDemandAuthorization = async () => {
  try {
    const onDemandAuthorization = await dwollaClient.post(
      "on-demand-authorizations"
    );
    const authLink = onDemandAuthorization.body._links;
    return authLink;
  } catch (err) {
    console.error("Creating an On Demand Authorization Failed: ", err);
    throw new Error(getDwollaErrorMessage(err));
  }
};

export const createDwollaCustomer = async (
  newCustomer: NewDwollaCustomerParams
) => {
  try {
    return await dwollaClient
      .post("customers", newCustomer)
      .then((res) => res.headers.get("location"));
  } catch (err) {
    console.error("Creating a Dwolla Customer Failed: ", err);
    throw new Error(getDwollaErrorMessage(err));
  }
};

// Dwolla customers can only ever be suspended, never deleted - a suspended
// customer's email is permanently unavailable for reuse (confirmed by
// Dwolla support: "If the Customer is suspended, there's no further action
// you can take to correct this using the API"). Checking this up front lets
// us fail fast with a clear message *before* creating an Appwrite account,
// instead of finding out only after the Appwrite account already exists.
export const checkDwollaCustomerEmailExists = async (email: string): Promise<boolean> => {
  try {
    const response = await dwollaClient.get("customers", {
      email,
    });
    const customers = response.body?._embedded?.customers ?? [];
    return customers.length > 0;
  } catch (err) {
    // If the availability check itself fails (e.g. network hiccup), don't
    // block sign-up on it - just let the normal creation flow run and
    // surface any real error from there.
    console.error("Checking Dwolla customer email failed: ", err);
    return false;
  }
};

export const createTransfer = async ({
  sourceFundingSourceUrl,
  destinationFundingSourceUrl,
  amount,
}: TransferParams) => {
  try {
    const requestBody = {
      _links: {
        source: {
          href: sourceFundingSourceUrl,
        },
        destination: {
          href: destinationFundingSourceUrl,
        },
      },
      amount: {
        currency: "USD",
        value: amount,
      },
    };
    return await dwollaClient
      .post("transfers", requestBody)
      .then((res) => res.headers.get("location"));
  } catch (err) {
    console.error("Transfer fund failed: ", err);
  }
};

export const addFundingSource = async ({
  dwollaCustomerId,
  processorToken,
  bankName,
}: AddFundingSourceParams) => {
  try {
    // create dwolla auth link
    const dwollaAuthLinks = await createOnDemandAuthorization();

    // add funding source to the dwolla customer & get the funding source url
    const fundingSourceOptions = {
      customerId: dwollaCustomerId,
      fundingSourceName: bankName,
      plaidToken: processorToken,
      _links: dwollaAuthLinks,
    };
    return await createFundingSource(fundingSourceOptions);
  } catch (err) {
    console.error("Transfer fund failed: ", err);
  }
};