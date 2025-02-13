import { Ed25519PrivateKey, Account } from "npm:@aptos-labs/ts-sdk";

// Transaction types
interface RawTransaction {
  sender: string;
  sequence_number: string;
  max_gas_amount: string;
  gas_unit_price: string;
  expiration_timestamp_secs: string;
  payload: {
    type: string;
    function: string;
    type_arguments: string[];
    arguments: any[];
  };
}

interface SignedTransaction {
  transaction: RawTransaction;
  signature: {
    type: string;
    public_key: string;
    signature: string;
  };
}

export class TransactionBuilder {
  private readonly nodeUrl: string;

  constructor(nodeUrl: string = "https://fullnode.testnet.aptoslabs.com/v1") {
    this.nodeUrl = nodeUrl;
  }

  /**
   * Get account sequence number
   */
  private async getAccountSequenceNumber(address: string): Promise<string> {
    const response = await fetch(`${this.nodeUrl}/accounts/${address}`);
    if (!response.ok) {
      throw new Error("Failed to fetch account sequence number");
    }
    const accountData = await response.json();
    return accountData.sequence_number;
  }

  /**
   * Build a raw transaction
   */
  async buildTransaction(args: {
    sender: string;
    payload: {
      function: string;
      typeArgs?: string[];
      args?: any[];
    };
  }): Promise<RawTransaction> {
    const { sender, payload } = args;

    // Get sequence number
    const sequenceNumber = await this.getAccountSequenceNumber(sender);

    // Build raw transaction
    return {
      sender,
      sequence_number: sequenceNumber,
      max_gas_amount: "2000",
      gas_unit_price: "100",
      expiration_timestamp_secs: (Math.floor(Date.now() / 1000) + 600).toString(),
      payload: {
        type: "entry_function_payload",
        function: payload.function,
        type_arguments: payload.typeArgs || [],
        arguments: payload.args || [],
      },
    };
  }

  /**
   * Sign a transaction
   */
  signTransaction(rawTxn: RawTransaction, privateKey: string): SignedTransaction {
    // Create account from private key
    const account = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(privateKey)
    });

    // Sign transaction
    const signature = account.sign(Buffer.from(JSON.stringify(rawTxn)).toString('hex'));

    return {
      transaction: rawTxn,
      signature: {
        type: "ed25519_signature",
        public_key: account.publicKey.toString(),
        signature: signature.toString()
      }
    };
  }

  /**
   * Submit transaction to chain
   */
  async submitTransaction(signedTxn: SignedTransaction): Promise<string> {
    const response = await fetch(`${this.nodeUrl}/transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(signedTxn),
    });

    if (!response.ok) {
      throw new Error(`Transaction submission failed: ${await response.text()}`);
    }

    const result = await response.json();
    return result.hash;
  }

  /**
   * Wait for transaction
   */
  async waitForTransaction(txnHash: string, timeoutSecs: number = 20): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutSecs * 1000) {
      try {
        const response = await fetch(`${this.nodeUrl}/transactions/by_hash/${txnHash}`);
        const txn = await response.json();
        if (txn.type === "user_transaction" && txn.success) {
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error(`Transaction ${txnHash} timed out`);
  }

  /**
   * Helper function to build, sign and submit a transaction
   */
  async buildSignSubmitTransaction(args: {
    sender: string;
    privateKey: string;
    payload: {
      function: string;
      typeArgs?: string[];
      args?: any[];
    };
  }): Promise<string> {
    // Build transaction
    const rawTxn = await this.buildTransaction({
      sender: args.sender,
      payload: args.payload
    });

    // Sign transaction
    const signedTxn = this.signTransaction(rawTxn, args.privateKey);

    // Submit transaction
    const hash = await this.submitTransaction(signedTxn);

    // Wait for transaction
    await this.waitForTransaction(hash);

    return hash;
  }
} 