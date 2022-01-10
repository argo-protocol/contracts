import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import addresses from "../oracleParams.json";

interface IOracleParams {
    gOHM: string;
    OHM_ETH: string;
    ETH_USD: string;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const networkName = hre.network.name;
    const config = (addresses as { [key: string]: IOracleParams })[networkName];

    const { deploy } = hre.deployments;
    const { deployer } = await hre.getNamedAccounts();

    const safeAggregatorV3 = await deploy("SafeAggregatorV3", {
        from: deployer,
        log: true,
    });

    await deploy("MainnetgOHMOracle", {
        from: deployer,
        args: [config.gOHM, config.OHM_ETH, config.ETH_USD],
        libraries: {
            SafeAggregatorV3: safeAggregatorV3.address,
        },
        log: true,
    });
};
func.dependencies = ["SafeAggregatorV3"];
func.tags = ["Oracle"];
export default func;
