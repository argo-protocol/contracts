import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import configs from "../deploy.config";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deploy } = hre.deployments;
    const { deployer } = await hre.getNamedAccounts();
    const config = configs[hre.network.name];

    const result = await deploy("DebtToken", {
        from: deployer,
        args: [config.treasuryMultisig],
        log: true,
    });

    const DebtToken = await hre.ethers.getContractFactory("DebtToken");
    const debtToken = await DebtToken.attach(result.address);
    if (await debtToken.owner() != config.operatorMultisig) {
        await debtToken.transferOwnership(config.operatorMultisig);
    }
};
func.tags = ["DebtToken"];
export default func;
