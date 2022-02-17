import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import configs from "../deploy.config";
import { assert } from "console";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deploy } = hre.deployments;
    const { deployer } = await hre.getNamedAccounts();
    const config = configs[hre.network.name];
    const debtToken = await hre.deployments.get("DebtToken");

    if (config.dai === hre.ethers.constants.AddressZero) {
        hre.deployments.log("Using mock reserve token");
        const daiDeployment = await hre.deployments.get("StubDai");
        config.dai = daiDeployment.address;
    }

    await deploy("DaiPSM", {
        contract: "PegStability",
        from: deployer,
        args: [debtToken.address, config.dai, config.psmBuyFee, config.psmSellFee, config.treasuryMultisig],
        log: true,
    });
};
func.dependencies = ["StubDai", "DebtToken"];
func.tags = ["PegStability"];
export default func;
