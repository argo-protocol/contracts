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

        await deploy("gOhmOracle", {
            contract: "MainnetgOHMOracle",
            from: deployer,
            args: [config.gOHM, config.ohmEthAggregator, config.ethUsdAggregator],
            log: true,
        });
    } else {
        log("deploying stub IOracle");

        await deploy("gOhmOracle", {
            contract: "StubOracle",
            from: deployer,
            args: [],
            log: true,
        });
    }
};

func.tags = ["mainnet-gOHM"];
export default func;
