import hre from "hardhat";
import yargs from "yargs/yargs";

async function main() {
    const { deployer, operatorMultisig } = await hre.getNamedAccounts();

    const argv = yargs(process.argv.slice(2))
        .options({
            address: {
                type: "string",
                demandOption: true,
                desc: "Recipient",
            },
            amount: {
                type: "string",
                demandOption: true,
                desc: "Amount as BigNumberish",
            },
        })
        .parseSync();
    

    const signer = await hre.ethers.getSigner(operatorMultisig);

    const deployment = await hre.deployments.get("DebtToken");
    const argo = (await hre.ethers.getContractAt("DebtToken", deployment.address)).connect(signer);

    console.log(await argo.owner());
    console.log("multisig", operatorMultisig);
    console.log("deployer", deployer);

    const tx = await argo.mint(argv.address,  argv.amount);
    await tx.wait();
 
    console.log(`${argv.address} balance is now ${await argo.balanceOf(argv.address)}`)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

