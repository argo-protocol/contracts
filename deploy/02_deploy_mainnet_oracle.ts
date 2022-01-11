import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

interface gOHMOracleConfig {
    gOHM: string;
    OHM_ETH: string;
    ETH_USD: string;
}

const configs: { [key: string]: gOHMOracleConfig } = {
    "1": {
        gOHM: "0x0ab87046fBb341D058F17CBC4c1133F25a20a52f",
        OHM_ETH: "0x90c2098473852e2f07678fe1b6d595b1bd9b16ed",
        ETH_USD: "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419",
    },
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deploy } = hre.deployments;
    const { deployer } = await hre.getNamedAccounts();
    const config = configs[await hre.getChainId()];

    await deploy("MainnetgOHMOracle", {
        from: deployer,
        args: [config.gOHM, config.OHM_ETH, config.ETH_USD],
        log: true,
    });
};
func.tags = ["Oracle"];
func.skip = async (hre: HardhatRuntimeEnvironment) => {
    const chainId = await hre.getChainId();
    const skip = !configs.hasOwnProperty(chainId);
    if (skip) {
        hre.deployments.log(`skipping "MainnetgOHMOracle" - no config for chain ${chainId}`);
    }
    return skip;
};
export default func;
