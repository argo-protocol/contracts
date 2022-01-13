import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import configs from "../deploy.config";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deploy } = hre.deployments;
    const { deployer } = await hre.getNamedAccounts();
    const config = configs[hre.network.name];

    await deploy("MarketFactory", {
        from: deployer,
        args: [config.operatorMultisig],
        log: true,
    });
};
func.tags = ["MarketFactory"];
export default func;
