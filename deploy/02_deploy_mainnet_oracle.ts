import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { gOHM, OHM_ETH, ETH_USD } from "../oracleAddresses.json";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deploy } = hre.deployments;
    const { deployer } = await hre.getNamedAccounts();

    const safeAggregatorV3 = await deploy("SafeAggregatorV3", {
        from: deployer,
        log: true,
    });

    await deploy("MainnetgOHMOracle", {
        from: deployer,
        args: [gOHM, OHM_ETH, ETH_USD],
        libraries: {
            SafeAggregatorV3: safeAggregatorV3.address,
        },
        log: true,
    });
};
func.dependencies = ["SafeAggregatorV3"];
func.tags = ["Oracle"];
export default func;
