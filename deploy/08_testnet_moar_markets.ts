import { deployments, ethers } from "hardhat";
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
    const deployedMarketSymbols = await Promise.all(
        (
            await marketFactory.getMarkets()
        ).map(async (addr) => {
            let market = await hre.ethers.getContractAt("ZeroInterestMarket", addr);
            let token = await hre.ethers.getContractAt("ERC20", await market.collateralToken());
            return await token.symbol();
        })
    );

    for (let collateral of collaterals) {
        if (deployedMarketSymbols.indexOf(`m${collateral}`) >= 0) {
            log(`m${collateral} market already exists. Skipped!`);
            continue;
        } else {
            log(`Deploy ${collateral} market...`);
        }

        log(`deploying stub ${collateral} IOracle...`);
        let oracleReceipt = await deploy(`${collateral}Oracle`, {
            contract: "StubOracle",
            from: deployer,
            args: [],
            log: true,
        });
        if (oracleReceipt.newlyDeployed) {
            const oracle = await hre.ethers.getContractAt("StubOracle", oracleReceipt.address);
            let ret = await oracle.setPrice(hre.ethers.utils.parseEther("1.1"));
            await ret.wait();
            log(`- deployed stub ${collateral} IOracle`);
        } else {
            log(`- ${collateral} IOracle already deployed. Skipped!`);
        }

        log(`deploying mock ${collateral} token...`);
        let tokenReciept = await deploy(`${collateral}Token`, {
            contract: "ERC20Mock",
            from: deployer,
            args: [`Mock ${collateral}`, `m${collateral}`, deployer, hre.ethers.utils.parseEther("10000")],
        });
        if (tokenReciept.newlyDeployed) {
            log(`- deployed mock ${collateral} token`);
        } else {
            log(`- ${collateral} token already deployed!`);
        }

        log(`Creating ${collateral} market`);
        const args = [
            treasuryMultisig,
            tokenReciept.address,
            (await hre.deployments.get("DebtToken")).address,
            oracleReceipt.address,
            50000,
            1000,
            15000,
        ] as const;
        const operatorMultisigSigner = await ethers.getSigner(operatorMultisig);
        const response = await marketFactory.connect(operatorMultisigSigner).createZeroInterestMarket(...args);
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
func.dependencies = [];
func.skip = async (env: HardhatRuntimeEnvironment) => env.network.config.chainId === 1;

export default func;
