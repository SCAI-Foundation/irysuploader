require("dotenv").config();
const readline = require("readline");
const { Uploader } = require("@irys/upload");
const { Solana } = require("@irys/upload-solana");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askUser = (question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim().toLowerCase());
    });
  });
};

const main = async () => {
  try {
    const irys = await Uploader(Solana).withWallet(process.env.PRIVATE_KEY);

    const address = irys.address;
    const token = irys.token;

    const atomicBalance = await irys.getLoadedBalance();
    const balance = irys.utils.fromAtomic(atomicBalance);

    console.log(`\n🌐 Public Address: ${address}`);
    console.log(`💰 Current Irys Balance: ${balance} ${token}`);
    console.log(`🔗 Check wallet on Solana Explorer: https://explorer.solana.com/address/${address}?cluster=mainnet`);

    const answer = await askUser("\n🪙 Do you want to fund 0.01 SOL to Irys? (yes/no): ");

    if (answer === "yes" || answer === "y") {
      const amount = "0.01";
      console.log(`\n⛽ Funding ${amount} SOL to Irys...`);

      const fundResult = await irys.fund(irys.utils.toAtomic(amount));
      console.log(`✅ Fund successful! Transaction ID: ${fundResult.id}`);
    } else {
      console.log("ℹ️ Funding skipped.");
    }
  } catch (err) {
    console.error("❌ Failed to get balance or fund Irys:", err);
  } finally {
    rl.close();
  }
};

main();
