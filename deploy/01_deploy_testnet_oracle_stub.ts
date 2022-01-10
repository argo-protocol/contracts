import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

interface IOracleParams {
    gOHM: string;
    OHM_ETH: string;
    ETH_USD: string;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deploy } = hre.deployments;
    const { deployer } = await hre.getNamedAccounts();

    await deploy("StubgOHMOracle", {
        from: deployer,
        args: [],
        log: true,
    });
};

func.dependencies = ["SafeAggregatorV3"];
func.tags = ["Oracle"];
func.skip = async (hre: HardhatRuntimeEnvironment) => hre.network.live;
export default func;
