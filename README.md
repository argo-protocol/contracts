# Argo Contracts

Argo is an OHM-focused decentralized borrowing protocol built around a synthetic stable unit of account.

## Develop

This project uses [Hardhat](https://hardhat.org/) and is based on the [Advanced Sample Hardhat Project](https://github.com/nomiclabs/hardhat/tree/master/packages/hardhat-core/sample-projects/advanced-ts). Built-in commands include

```shell
npx hardhat accounts
npx hardhat compile
npx hardhat clean
npx hardhat test
npx hardhat node
npx hardhat help
REPORT_GAS=true npx hardhat test
npx hardhat coverage
```

## Test

Basic Hardhat-basted testing:

```
yarn test
```

Full testing requires installation of [dapp tools](https://dapp.tools/):

```
yarn fuzz
```

## Deploy

This project uses [hardhat-deploy](https://github.com/wighawag/hardhat-deploy) to manage and track deployments.

To deploy locally:

```
npx hardhat deploy --network localhost
```

### Run locally

When running a local node, deployments are automatic:

```
npx hardhat node --network localhost
```

To run without deployments:

```
npx hardhat node --no-deploy
```


## Creating a market

To prepare a transaction for separate signing (e.g. via a Gnosis Safe or similar):

```
HARDHAT_NETWORK=localhost npx ts-node --files scripts/createMarket.ts --treasury 0x0ab87046fBb341D058F17CBC4c1133F25a20a52f \
--collateralToken 0x0ab87046fBb341D058F17CBC4c1133F25a20a52f \
--debtToken 0x0ab87046fBb341D058F17CBC4c1133F25a20a52f \
--oracle 0x0ab87046fBb341D058F17CBC4c1133F25a20a52f \
--maxLoanToValue 3 \
--borrowRate 2 \
--liquidationPenalty 1 \
--prepare
```

### Formatting

```
yarn pretter
```

### Contact

Discord link (TODO)
