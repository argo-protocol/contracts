import hre from "hardhat";
import yargs from "yargs/yargs";

async function main() {
    const { deployer } = await hre.getNamedAccounts();

    const argv = yargs(process.argv.slice(2))
        .options({
            address: {
                type: "string",
                demandOption: false,
                default: deployer,
                desc: "Recipient. Blank for deployer",
            },
            amount: {
                type: "string",
                demandOption: true,
                desc: "Amount as BigNumberish",
            },
        })
        .parseSync();

    const signer = await hre.ethers.getSigner(deployer);

    const deployment = await hre.deployments.get("StubDai");
    const stubDai = (await hre.ethers.getContractAt("ERC20Mock", deployment.address)).connect(signer);

    const tx = await stubDai.mint(argv.address, argv.amount);
    await tx.wait();

    console.log(`${argv.address} balance is now ${await stubDai.balanceOf(argv.address)}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
