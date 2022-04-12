import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import configs from "../deploy.config";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deploy, log } = hre.deployments;
    const { deployer } = await hre.getNamedAccounts();
    const config = configs[hre.network.name];

    if (hre.network.live) {
        if (config.ohmEthAggregator === hre.ethers.constants.AddressZero) {
            log("deploying stub OHM-ETH chainlink aggregator");
            let ohmEthResult = await deploy("stubOhmEthAggregator", {
                contract: "StubAggregator",
                from: deployer,
                args: [
                    18, // decimals
                    "OHMv2 / ETH", // description
                    4, // version
                    "65632235192786370", // price
                ],
                log: true,
            });
            config.ohmEthAggregator = ohmEthResult.address;
        }

        let uniswapOracleResult = await deploy("uniswapOracle", {
            contract: "uniswapOracle",
            from: deployer,
            args: [config.sushiSwapFactory, config.btrfly, config.ohmv2],
            log: true,
        });
        config.uniswapOracle = uniswapOracleResult.address;
        const UniswapOracleContract = await hre.ethers.getContractFactory("uniswapOracle");
        const uniswapOracleContract = await UniswapOracleContract.attach(uniswapOracleResult.address);
        if ((await uniswapOracleContract.owner()) != config.operatorMultisig) {
            await uniswapOracleContract.transferOwnership(config.operatorMultisig);
        }

        await deploy("wxBTRFLYOracle", {
            contract: "MainnetwxBTRFLYOracle",
            from: deployer,
            args: [
                config.wxBtrfly,
                config.btrfly,
                config.uniswapOracle,
                config.ohmv2,
                config.ohmEthAggregator,
                config.ethUsdAggregator,
            ],
            log: true,
        });
    } else {
        log("deploying stub IOracle");

        await deploy("wxBTRFLYOracle", {
            contract: "StubOracle",
            from: deployer,
            args: [],
            log: true,
        });
    }
};

func.tags = ["mainnet-wxBTRFLY"];
func.skip = async () => true;
export default func;
