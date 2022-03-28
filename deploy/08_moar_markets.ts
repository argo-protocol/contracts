import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployer, operatorMultisig, treasuryMultisig } = await hre.getNamedAccounts();
    const { deploy, log } = hre.deployments;

    const collaterals = [
        "FOO",
        "BAR",
        "BAZ",
        "QUX",
        "QUUX",
        "CORGE",
        "GRAULT",
        "GARPLY",
        "WALDO",
        "FRED",
        "PLUGH",
        "XYZZY",
        "THUD",
    ];

    const deployment = await hre.deployments.get("MarketFactory");
    const marketFactory = await hre.ethers.getContractAt("MarketFactory", deployment.address);
    const marketTokens = await Promise.all((await marketFactory.getMarkets()).map(async (addr) => {
        let market = await hre.ethers.getContractAt("ZeroInterestMarket", addr);
        let token = await market.collateralToken();
        return token;
    }));

    console.log(marketTokens);

    for (let collateral of collaterals) {
        log(`deploying stub ${collateral} IOracle`);
        let oracleReceipt = await deploy(`${collateral}Oracle`, {
            contract: "StubOracle",
            from: deployer,
            args: [],
            log: true,
        });
        const oracle = await hre.ethers.getContractAt("StubOracle", oracleReceipt.address);
        let ret = await oracle.setPrice(hre.ethers.utils.parseEther("1.1"));
        await ret.wait();

        log(`deploying mock ${collateral} token`);
        let tokenReciept = await deploy(`${collateral}Token`, {
            contract: "ERC20Mock",
            from: deployer,
            args: ["Mock DAI", "mDAI", deployer, hre.ethers.utils.parseEther("10000")],
        });

        log(`creating ${collateral} market`);
        const args = [
            treasuryMultisig,
            tokenReciept.address,
            (await hre.deployments.get("DebtToken")).address,
            oracleReceipt.address,
            50000,
            1000,
            15000,
        ] as const;
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
};
func.tags = ["TestMarkets"];
func.dependencies = ["MarketFactory", "StubDai", "DebtToken", "mainnet-gOHM"];
export default func;

