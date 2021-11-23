# Popcorn

[![Codacy Badge](https://api.codacy.com/project/badge/Grade/8af04768693b48bb9c84120bfde78d92)](https://app.codacy.com/gh/popcorndao/workspace?utm_source=github.com&utm_medium=referral&utm_content=popcorndao/workspace&utm_campaign=Badge_Grade_Settings)

- [Popcorn](#popcorn)
  - [Technology Used](#technology-used)
  - [Directory structure](#directory-structure)
  - [Prerequisites](#prerequisites)
  - [Getting started with Development](#getting-started-with-development)
  - [Getting started with Frontend](#getting-started-with-frontend)
  - [Getting started with Contracts](#getting-started-with-contracts)
  - [Default Service Locations](#default-service-locations)
  - [Useful Commands](#useful-commands)
  - [Useful Hardhat Commands](#useful-hardhat-commands)
  - [Contributing](#contributing)

## Technology Used

- [Next.js](https://nextjs.org/)
- [Lerna](https://lerna.js.org)
- [Yarn](https://yarnpkg.com)
- [Storybook](https://storybook.js.org/)
- [React styled components](https://styled-components.com)
- [Solidity](https://soliditylang.org)
- [Hardhat](https://hardhat.org)
- [React testing library](https://testing-library.com/docs/react-testing-library/intro/)

## Directory structure

```
packages
├── app            [@popcorn/app]          [next.js]
├── contracts      [@popcorn/contracts]    [solidity contracts]
├── scripts        [@popcorn/scripts]      [deploy scripts, etc]
├── utils          [@popcorn/utils]        [generic utils]
├── ui             [@popcorn/ui]           [ui components + storybook]
└── ... etc
```

## Prerequisites

1. Make sure you run node.js v14.x.x (newer node versions might not work properly). You can manage node versions with, for example, [nvm](https://github.com/nvm-sh/nvm).
2. Copy `.env.example` to `.env` inside your workspace to satisfy hardhat when running _yarn install_ in the next step. You can fill in your own env var values for at a later point in time.
3. Install packages via

```
yarn install
```

4. When you want to commit changes you need to install lerna globally

```
yarn global add lerna
```

as well as prepare husky as pre-commit action

```
yarn prepare
```

## Getting started with development

1. To start the nextjs app and a local hardhat node run:

```
yarn lerna run dev  --parallel
```

2. Then in another terminal you can deploy the contracts with some fixtures.

```
yarn hardhat dev:deploy --network localhost
```

This will deploy all contracts and create 3 elections with pre-registered beneficiaries with the following attributes:

1. Monthly (Accelerated Voting Enabled)
2. Quarterly (Accelerated Voting Enabled)
3. Yearly (Default Configuration)

> To update the election state (for instance, to change from registration period to voting period for the elections with accelerated voting enabled), you can run this command:
>
> ```
> yarn hardhat elections:refreshElectionState --term 1 --network localhost
> ```

3. Now update your `.env` file with the contract addresses output in the previous command.

## Getting started with Frontend

1. Install packages

   - `yarn install`

2. Run dev (watch files and start up frontend)

   - `yarn lerna run dev --parallel`

3. Start storybook (optional):
   - `yarn lerna run story --parallel`

## Getting started with Contracts

To run tests:
go to `packages/contracts`
`yarn hardhat test`

Deploy from `packages/contracts`:

1. compile: `yarn hardhat compile`
2. in one terminal: `yarn hardhat node`
3. in another terminal: `yarn hardhat dev:deploy`

## Default Service Locations

| Service          | Location                    |
| ---------------- | --------------------------- |
| Next.js Frontend | http://localhost:3000       |
| Storybook        | run: `yarn lerna run story` |

## Useful Commands

| Command                              | Description                                                          |
| ------------------------------------ | -------------------------------------------------------------------- |
| `yarn install`                       | equivalent to `npm install`                                          |
| `yarn add @org/packagename`          | equivalent to `npm install` - will add to dependencies               |
| `yarn add @org/packagename -D`       | equivalent to `npm install --save-dev` - will add to devDependencies |
| `lerna dev --parallel`               | run package.json "dev" script on all projects                        |
| `lerna run dev --scope=@popcorn/app` | run package.json "dev" script only on frontend package               |
| `lerna run story`                    | start storybook                                                      |
| `lerna run test --parallel`          | run tests                                                            |

## Useful Hardhat Commands

| Command                                                                    | Description                                                                    |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `yarn hardhat dev:deploy`                                                  | deploy contracts for development                                               |
| `yarn hardhat elections:refreshElectionState --term 1 --network localhost` | refresh election state                                                         |
| `yarn hardhat elections:getElectionMetadata --term 1 --network localhost`  | get metadata for election term                                                 |
| `yarn lerna run --scope @popcorn/contracts docify`                         | generate documentation for contracts (found in packages/contracts/docgen/docs) |

## Contributing

Contributions are welcome! Please raise a pull request with your contributions.

Popcorn follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/1/4/code-of-conduct).
