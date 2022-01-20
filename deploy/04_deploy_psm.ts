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
        assert(!hre.network.live, "can't have MockERC20s in live environments");
        hre.deployments.log("deploying mock reserve token");
        let ret = await deploy("StubDai", {
            contract: "ERC20Mock",
            from: deployer,
            args: [
                "Mock DAI",
                "mDAI",
                deployer,
                0
            ]
        });

        config.dai = ret.address;
    }

    await deploy("DaiPSM", {
        contract: "PegStability",
        from: deployer,
        args: [
            debtToken.address,
            config.dai,
            config.psmBuyFee,
            config.psmSellFee,
            config.treasuryMultisig,
        ],
        log: true,
    });
};
func.tags = ["PegStability"];
export default func;

