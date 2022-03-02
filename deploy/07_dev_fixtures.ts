import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployer, operatorMultisig, treasuryMultisig } = await hre.getNamedAccounts();

    const signer = await hre.ethers.getSigner(operatorMultisig);

    const stubDaiDeployment = await hre.deployments.get("StubDai");
    const stubDai = (await hre.ethers.getContractAt("ERC20Mock", stubDaiDeployment.address)).connect(signer);
    for (let addr of [deployer, operatorMultisig, treasuryMultisig]) {
        await stubDai.mint(addr, hre.ethers.utils.parseEther("1000"));
        hre.deployments.log(`Minted 1000 StubDai to ${addr}`);
    }

    const oracleDeployment = await hre.deployments.get("gOhmOracle");
    const oracle = await hre.ethers.getContractAt("StubOracle", oracleDeployment.address);
    await oracle.setPrice(hre.ethers.utils.parseEther("1.1"));
    hre.deployments.log("StubOracle price set to 1.1");

    const debtTokenDeployment = await hre.deployments.get("DebtToken");

    const deployment = await hre.deployments.get("MarketFactory");
    const marketFactory = await hre.ethers.getContractAt("MarketFactory", deployment.address);
    const tx = await marketFactory
        .connect(signer)
        .createZeroInterestMarket(
            treasuryMultisig,
            stubDai.address,
            debtTokenDeployment.address,
            oracleDeployment.address,
            "15000",
            "1000",
            "10000"
        );
    await tx.wait();
    const logs = await marketFactory.queryFilter(marketFactory.filters.CreateMarket(), "latest");
    const id = logs[0].args[0];
    const marketAddr = await marketFactory.markets(id);
    hre.deployments.log(`New Market ${id} at ${marketAddr}`);

    const market = await hre.ethers.getContractAt("ZeroInterestMarket", marketAddr);
    await market.connect(signer).updatePrice();
};
func.tags = ["Fixtures"];
func.dependencies = ["MarketFactory", "StubDai", "DebtToken", "mainnet-gOHM"];
func.skip = async (env: HardhatRuntimeEnvironment) => env.network.live;
export default func;
