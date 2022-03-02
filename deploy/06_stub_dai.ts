import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import configs from "../deploy.config";
import { assert } from "console";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deploy } = hre.deployments;
    const { deployer } = await hre.getNamedAccounts();
    hre.deployments.log("Deploying ERC20Mock as StubDai");
    const result = await deploy("StubDai", {
        contract: "ERC20Mock",
        from: deployer,
        args: ["Mock DAI", "mDAI", deployer, 0],
    });
};
func.tags = ["StubDai"];
func.skip = async (env: HardhatRuntimeEnvironment) => env.network.live;
export default func;
