import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import configs from "../deploy.config";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deploy, log } = hre.deployments;
    const { deployer, operatorMultisig } = await hre.getNamedAccounts();
    const config = configs[hre.network.name];

    const result = await deploy("DebtToken", {
        from: deployer,
        args: [config.treasuryMultisig],
        log: true,
    });

    const DebtToken = await hre.ethers.getContractFactory("DebtToken");
    const debtToken = await DebtToken.attach(result.address);
    if ((await debtToken.owner()) != operatorMultisig) {
        log("transfering ownership to operator multisig");
        await debtToken.transferOwnership(operatorMultisig);
    }
    if ((await debtToken.lzAdmin()) == deployer) {
        log("transfering LayerZero admin to operator multisig");
        await debtToken.transferLayerZeroAdmin(operatorMultisig);
    }
};
func.tags = ["DebtToken"];
export default func;
