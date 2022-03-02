import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import configs from "../deploy.config";
import { assert } from "console";
import { deployments } from "hardhat";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deploy } = hre.deployments;
    const { deployer, operatorMultisig } = await hre.getNamedAccounts();
    const config = configs[hre.network.name];
    const debtToken = await hre.deployments.get("DebtToken");

    if (config.dai === hre.ethers.constants.AddressZero) {
        hre.deployments.log("Using mock reserve token");
        const daiDeployment = await hre.deployments.get("StubDai");
        config.dai = daiDeployment.address;
    }

    let daiPSMResult = await deploy("DaiPSM", {
        contract: "PegStability",
        from: deployer,
        args: [debtToken.address, config.dai, config.psmBuyFee, config.psmSellFee, config.treasuryMultisig],
        log: true,
    });
    const DaiPSMContract = await hre.ethers.getContractFactory("PegStability");
    const contract = await DaiPSMContract.attach(daiPSMResult.address);
    if (await contract.owner() != operatorMultisig) {
        deployments.log("transfering ownership to operatorMultisig");
        await contract.transferOwnership(operatorMultisig);
    }
};
func.dependencies = ["StubDai", "DebtToken"];
func.tags = ["PegStability"];
export default func;
