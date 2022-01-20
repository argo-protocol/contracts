import hre from "hardhat";
import yargs from "yargs/yargs";

async function main() {
    const argv = yargs(process.argv.slice(2))
        .options({
            prepare: {
                type: "boolean",
                demandOption: false,
                desc: "only prepare, but do not send transaction",
            },
            treasury: {
                type: "string",
                demandOption: true,
                desc: "Address of treasury",
            },
            collateralToken: {
                type: "string",
                demandOption: true,
                desc: "address of collateralToken",
            },
            debtToken: {
                type: "string",
                demandOption: false,
                desc: "address of debtToken",
            },
            oracle: {
                type: "string",
                demandOption: true,
                desc: "address of oracle",
            },
            maxLoanToValue: {
                type: "number",
                demandOption: true,
                desc: "maxLoanToValue",
            },
            borrowRate: {
                type: "number",
                demandOption: true,
                desc: "borrowRate",
            },
            liquidationPenalty: {
                type: "number",
                demandOption: true,
                desc: "liquidationPenalty",
            },
        })
        .parseSync();

    const { operatorMultisig } = await hre.getNamedAccounts();
    const ownerSigner = await hre.ethers.getSigner(operatorMultisig);

    const deployment = await hre.deployments.get("MarketFactory");
    const marketFactory = (await hre.ethers.getContractAt("MarketFactory", deployment.address)).connect(ownerSigner);

    const debtToken = argv.debtToken || (await hre.deployments.get("DebtToken")).address;

    const args = [
        argv.treasury,
        argv.collateralToken,
        debtToken,
        argv.oracle,
        argv.maxLoanToValue,
        argv.borrowRate,
        argv.liquidationPenalty,
    ] as const;
    if (argv.prepareOnly) {
        const tx = await marketFactory.populateTransaction.createZeroInterestMarket(...args);
        console.log(tx);
        return;
    }
    const response = await marketFactory.createZeroInterestMarket(...args);
    const receipt = await response.wait();

    const createMarketEvent = receipt.events!.find((e: any) => e.event === "CreateMarket");
    if (!createMarketEvent || !createMarketEvent.args || !createMarketEvent.args.length) {
        throw "No valid createMarket events detected";
    }
    const marketID = createMarketEvent.args[0].toString();
    const marketAddress = await marketFactory.markets(marketID);
    console.log(`Created listing ${marketID} at address ${marketAddress}, transaction hash ${response.hash}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
