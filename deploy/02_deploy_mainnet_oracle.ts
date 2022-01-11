import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { gOHM, OHM_ETH, ETH_USD } from "../oracleAddresses.json";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deploy } = hre.deployments;
    const { deployer } = await hre.getNamedAccounts();

    await deploy("MainnetgOHMOracle", {
        from: deployer,
        args: [gOHM, OHM_ETH, ETH_USD],
        log: true,
    });
};
func.tags = ["Oracle"];
export default func;
