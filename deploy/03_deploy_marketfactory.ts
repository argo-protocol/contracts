import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deploy } = hre.deployments;
    const { deployer, owner } = await hre.getNamedAccounts();

    await deploy("MarketFactory", {
        from: deployer,
        args: [owner],
        log: true,
    });
};
func.tags = ["MarketFactory"];
export default func;
