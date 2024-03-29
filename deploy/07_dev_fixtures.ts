import { parseEther } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const NUM_MARKETS = parseInt(process.env.NUM_MARKETS || "3", 10);

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployer, operatorMultisig, treasuryMultisig, stubUser1, stubUser2 } = await hre.getNamedAccounts();

    const signer = await hre.ethers.getSigner(operatorMultisig);

    const stubDaiDeployment = await hre.deployments.get("StubDai");
    const stubDai = (await hre.ethers.getContractAt("ERC20Mock", stubDaiDeployment.address)).connect(signer);
    for (let addr of [deployer, operatorMultisig, treasuryMultisig, stubUser1, stubUser2]) {
        await stubDai.mint(addr, hre.ethers.utils.parseEther("1000").mul(NUM_MARKETS));
        hre.deployments.log(`Minted 1000 StubDai to ${addr}`);
    }

    const oracleDeployment = await hre.deployments.get("gOhmOracle");
    const oracle = await hre.ethers.getContractAt("StubOracle", oracleDeployment.address);
    await oracle.setPrice(hre.ethers.utils.parseEther("1.5"));
    hre.deployments.log("StubOracle price set to 1.5");

    const debtTokenDeployment = await hre.deployments.get("DebtToken");
    const debtToken = await hre.ethers.getContractAt("DebtToken", debtTokenDeployment.address);

    const deployment = await hre.deployments.get("MarketFactory");
    const marketFactory = await hre.ethers.getContractAt("MarketFactory", deployment.address);

    for (let i = 0; i < NUM_MARKETS; i++) {
        const ltv = Math.floor(50000 + (40000 * i) / NUM_MARKETS);
        const fee = Math.floor(7000 * i);
        const penalty = Math.floor(20000 * i);

        await marketFactory
            .connect(signer)
            .createZeroInterestMarket(
                treasuryMultisig,
                stubDai.address,
                debtTokenDeployment.address,
                oracleDeployment.address,
                ltv,
                fee,
                penalty
            );
        const logs = await marketFactory.queryFilter(marketFactory.filters.CreateMarket(), "latest");
        const id = logs[0].args[0];
        const marketAddr = await marketFactory.markets(id);
        hre.deployments.log(`New Market ${id} at ${marketAddr}`);

        debtToken.connect(signer).mint(marketAddr, parseEther("10000"));
        hre.deployments.log(`Minted debt tokens to market`);

        const market = await hre.ethers.getContractAt("ZeroInterestMarket", marketAddr);
        await market.connect(signer).updatePrice();
        hre.deployments.log(`Market price updated`);

        await stubDai.connect(await ethers.getSigner(stubUser1)).approve(marketAddr, parseEther("500"));
        await market.connect(await ethers.getSigner(stubUser1)).depositAndBorrow(parseEther("500"), parseEther("250"));
        hre.deployments.log(`StubUser1 deposited 500 from ${market.address}, borrowed 300`);

        await stubDai.connect(await ethers.getSigner(stubUser2)).approve(marketAddr, parseEther("1000"));
        await market.connect(await ethers.getSigner(stubUser2)).depositAndBorrow(parseEther("1000"), parseEther("500"));
        hre.deployments.log(`StubUser2 deposited 500 from ${market.address}, borrowed 300`);
    }
};
func.tags = ["Dev", "Fixtures"];
func.dependencies = ["MarketFactory", "StubDai", "DebtToken", "mainnet-gOHM"];
func.skip = async (env: HardhatRuntimeEnvironment) => env.network.live;
export default func;
