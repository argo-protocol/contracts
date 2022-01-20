import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deploy } = hre.deployments;
    const { deployer, operatorMultisig } = await hre.getNamedAccounts();

    await deploy("MarketFactory", {
        from: deployer,
        args: [operatorMultisig],
        log: true,
    });
};
func.tags = ["MarketFactory"];
export default func;
