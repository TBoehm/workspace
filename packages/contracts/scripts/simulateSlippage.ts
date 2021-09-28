import { BigNumber } from "@ethersproject/bignumber";
import { parseEther } from "@ethersproject/units";
import { bigNumberToNumber } from "@popcorn/utils";
import { Network } from "hardhat/types";
import {
  BatchType,
  ComponentMap,
} from "../adapters/HYSIBatchInteraction/HYSIBatchInteractionAdapter";
import deployContracts, { Contracts } from "../test/utils/deployContracts";
import { CurveMetapool, MockYearnV2Vault } from "../typechain";
const fs = require("fs");

async function getHysiBalanceInUSD(
  hysiBalance: BigNumber,
  componentMap: ComponentMap,
  contracts: Contracts
): Promise<BigNumber> {
  const components =
    await contracts.basicIssuanceModule.getRequiredComponentUnitsForIssue(
      contracts.setToken.address,
      hysiBalance
    );
  const componentAddresses = components[0];
  const componentAmounts = components[1];

  const componentVirtualPrices = await Promise.all(
    componentAddresses.map(async (component) => {
      const metapool = componentMap[component.toLowerCase()]
        .metaPool as CurveMetapool;
      const yPool = componentMap[component.toLowerCase()]
        .yPool as MockYearnV2Vault;
      const yPoolPricePerShare = await yPool.pricePerShare();
      const metapoolPrice = await metapool.get_virtual_price();
      return yPoolPricePerShare.mul(metapoolPrice).div(parseEther("1"));
    })
  );

  const componentValuesInUSD = componentVirtualPrices.reduce(
    (sum, componentPrice, i) => {
      return sum.add(
        componentPrice.mul(componentAmounts[i]).div(parseEther("1"))
      );
    },
    parseEther("0")
  );
  return componentValuesInUSD;
}

export default async function simulateSlippage(
  ethers,
  network: Network
): Promise<void> {
  const MAX_SLIPPAGE = 0.005;
  const INPUT_AMOUNT = parseEther("100000000");
  let mintBlockNumber = 12833323;

  const RESET_BLOCK_NUMBER = 12833323; //mintBlockNumber - 10
  const END_BLOCK_NUMBER = 13307297;
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: process.env.FORKING_RPC_URL,
          blockNumber: RESET_BLOCK_NUMBER,
        },
      },
    ],
  });
  const [signer] = await ethers.getSigners();

  const contracts = await deployContracts(ethers, network, signer);
  const componentMap: ComponentMap = {
    [contracts.yDUSD.address]: {
      name: "yDUSD",
      metaPool: contracts.dusdMetapool,
      yPool: contracts.yDUSD,
    },
    [contracts.yFRAX.address]: {
      name: "yFRAX",
      metaPool: contracts.fraxMetapool,
      yPool: contracts.yFRAX,
    },
    [contracts.yUSDN.address]: {
      name: "yUSDN",
      metaPool: contracts.usdnMetapool,
      yPool: contracts.yUSDN,
    },
    [contracts.yUST.address]: {
      name: "yUST",
      metaPool: contracts.ustMetapool,
      yPool: contracts.yUST,
    },
  };
  await contracts.faucet.sendThreeCrv(100000, signer.address);

  while (mintBlockNumber < END_BLOCK_NUMBER) {
    await contracts.threeCrv
      .connect(signer)
      .approve(contracts.hysiBatchInteraction.address, 0);
    await contracts.hysi
      .connect(signer)
      .approve(contracts.hysiBatchInteraction.address, 0);
    await contracts.threeCrv
      .connect(signer)
      .approve(
        contracts.hysiBatchInteraction.address,
        parseEther("1000000000")
      );
    await contracts.hysi
      .connect(signer)
      .approve(
        contracts.hysiBatchInteraction.address,
        parseEther("1000000000")
      );

    const threeCrvPrice = await contracts.threePool.get_virtual_price();
    const inputAmountInUSD = INPUT_AMOUNT.mul(threeCrvPrice).div(
      parseEther("1")
    );
    await contracts.hysiBatchInteraction
      .connect(signer)
      .depositForMint(INPUT_AMOUNT, signer.address);
    const mintBatchId =
      await contracts.hysiBatchInteraction.currentMintBatchId();
    await contracts.hysiBatchInteraction.connect(signer).batchMint(0);
    const mintingBlock = await ethers.provider.getBlock("latest");
    mintBlockNumber = mintingBlock.number;

    const hysiBalance = await (
      await contracts.hysiBatchInteraction.batches(mintBatchId)
    ).claimableTokenBalance;

    const hysiAmountInUSD = await getHysiBalanceInUSD(
      hysiBalance,
      componentMap,
      contracts
    );
    const slippage =
      bigNumberToNumber(
        inputAmountInUSD.mul(parseEther("1")).div(hysiAmountInUSD)
      ) - 1;
    fs.appendFileSync(
      "slippage.csv",
      `\r\n${mintBlockNumber},${
        mintingBlock.timestamp
      },${INPUT_AMOUNT.toString()},${inputAmountInUSD.toString()},${hysiBalance.toString()},${hysiAmountInUSD.toString()},${slippage},${
        slippage <= MAX_SLIPPAGE
      }`
    );
    console.log(
      `At block: ${mintBlockNumber} - ${
        mintingBlock.timestamp
      }, inputAmount ${INPUT_AMOUNT.toString()} 3CRV => ${inputAmountInUSD.toString()} USD, outputAmount: ${hysiBalance.toString()} => ${hysiAmountInUSD.toString()} USD, slippage: ${slippage} is accepable ${
        slippage <= MAX_SLIPPAGE
      }`
    );
    console.log(
      "-----------------------------------------------------------------------------"
    );

    await contracts.hysiBatchInteraction
      .connect(signer)
      .moveUnclaimedDepositsIntoCurrentBatch(
        [mintBatchId],
        [INPUT_AMOUNT],
        BatchType.Mint
      );
    const redeemId =
      await contracts.hysiBatchInteraction.currentRedeemBatchId();
    await contracts.hysiBatchInteraction.connect(signer).batchRedeem(0);
    await contracts.hysiBatchInteraction
      .connect(signer)
      .claim(redeemId, signer.address);
    Array(35)
      .fill(0)
      .forEach((x) => ethers.provider.send("evm_mine", []));
  }
}
