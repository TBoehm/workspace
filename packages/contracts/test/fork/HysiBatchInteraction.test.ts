import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import BasicIssuanceModuleAbi from "@setprotocol/set-protocol-v2/artifacts/contracts/protocol/modules/BasicIssuanceModule.sol/BasicIssuanceModule.json";
import SetTokenAbi from "@setprotocol/set-protocol-v2/artifacts/contracts/protocol/SetToken.sol/SetToken.json";
import {
  BasicIssuanceModule,
  SetToken,
} from "@setprotocol/set-protocol-v2/dist/typechain";
import bluebird from "bluebird";
import { expect } from "chai";
import { BigNumber, utils } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers, network, waffle } from "hardhat";
import HysiBatchInteractionAdapter, {
  ComponentMap,
} from "../../adapters/HYSIBatchInteraction/HYSIBatchInteractionAdapter";
import CurveMetapoolAbi from "../../lib/Curve/CurveMetapoolAbi.json";
import {
  ACLRegistry,
  ContractRegistry,
  CurveMetapool,
  ERC20,
  Faucet,
  HysiBatchInteraction,
  KeeperIncentive,
  MockERC20,
  MockYearnV2Vault,
  Staking,
} from "../../typechain";

const provider = waffle.provider;

interface Contracts {
  mockPop: MockERC20;
  threeCrv: ERC20;
  crvDUSD: ERC20;
  crvFRAX: ERC20;
  crvUSDN: ERC20;
  crvUST: ERC20;
  threePool: CurveMetapool;
  dusdMetapool: CurveMetapool;
  fraxMetapool: CurveMetapool;
  usdnMetapool: CurveMetapool;
  ustMetapool: CurveMetapool;
  yDUSD: MockYearnV2Vault;
  yFRAX: MockYearnV2Vault;
  yUSDN: MockYearnV2Vault;
  yUST: MockYearnV2Vault;
  hysi: SetToken;
  setToken: SetToken; // alias for hysi
  basicIssuanceModule: BasicIssuanceModule;
  hysiBatchInteraction: HysiBatchInteraction;
  staking: Staking;
  keeperIncentive: KeeperIncentive;
  faucet: Faucet;
  aclRegistry: ACLRegistry;
  contractRegistry: ContractRegistry;
}

enum BatchType {
  Mint,
  Redeem,
}

let hysiBalance: BigNumber;
let owner: SignerWithAddress,
  depositor: SignerWithAddress,
  depositor1: SignerWithAddress,
  depositor2: SignerWithAddress,
  depositor3: SignerWithAddress;
let contracts: Contracts;

const HYSI_TOKEN_ADDRESS = "0x8d1621a27bb8c84e59ca339cf9b21e15b907e408";

const SET_BASIC_ISSUANCE_MODULE_ADDRESS =
  "0xd8EF3cACe8b4907117a45B0b125c68560532F94D";

const THREE_CRV_TOKEN_ADDRESS = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";

const THREEPOOL_ADDRESS = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";
const CRV_DUSD_TOKEN_ADDRESS = "0x3a664ab939fd8482048609f652f9a0b0677337b9";
const CRV_FRAX_TOKEN_ADDRESS = "0xd632f22692fac7611d2aa1c0d552930d43caed3b";
const CRV_USDN_TOKEN_ADDRESS = "0x4f3e8f405cf5afc05d68142f3783bdfe13811522";
const CRV_UST_TOKEN_ADDRESS = "0x94e131324b6054c0D789b190b2dAC504e4361b53";

const DUSD_METAPOOL_ADDRESS = "0x8038C01A0390a8c547446a0b2c18fc9aEFEcc10c";
const FRAX_METAPOOL_ADDRESS = "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B";
const USDN_METAPOOL_ADDRESS = "0x0f9cb53Ebe405d49A0bbdBD291A65Ff571bC83e1";
const UST_METAPOOL_ADDRESS = "0x890f4e345B1dAED0367A877a1612f86A1f86985f";

const YDUSD_TOKEN_ADDRESS = "0x30fcf7c6cdfc46ec237783d94fc78553e79d4e9c";
const YFRAX_TOKEN_ADDRESS = "0xb4ada607b9d6b2c9ee07a275e9616b84ac560139";
const YUSDN_TOKEN_ADDRESS = "0x3b96d491f067912d18563d56858ba7d6ec67a6fa";
const YUST_TOKEN_ADDRESS = "0x1c6a9783f812b3af3abbf7de64c3cd7cc7d1af44";

const UNISWAP_ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const CURVE_ADDRESS_PROVIDER_ADDRESS =
  "0x0000000022D53366457F9d5E68Ec105046FC4383";
const CURVE_FACTORY_METAPOOL_DEPOSIT_ZAP_ADDRESS =
  "0xA79828DF1850E8a3A3064576f380D90aECDD3359";

const componentMap: ComponentMap = {
  [YDUSD_TOKEN_ADDRESS]: {
    metaPool: undefined,
    yPool: undefined,
  },
  [YFRAX_TOKEN_ADDRESS]: {
    metaPool: undefined,
    yPool: undefined,
  },
  [YUSDN_TOKEN_ADDRESS]: {
    metaPool: undefined,
    yPool: undefined,
  },
  [YUST_TOKEN_ADDRESS]: {
    metaPool: undefined,
    yPool: undefined,
  },
};

async function deployContracts(): Promise<Contracts> {
  //Deploy helper Faucet
  const Faucet = await ethers.getContractFactory("Faucet");
  const faucet = await (
    await Faucet.deploy(
      UNISWAP_ROUTER_ADDRESS,
      CURVE_ADDRESS_PROVIDER_ADDRESS,
      CURVE_FACTORY_METAPOOL_DEPOSIT_ZAP_ADDRESS
    )
  ).deployed();
  await network.provider.send("hardhat_setBalance", [
    faucet.address,
    "0x152d02c7e14af6800000", // 100k ETH
  ]);

  const mockPop = await (
    await (
      await ethers.getContractFactory("MockERC20")
    ).deploy("POP", "POP", 18)
  ).deployed();

  //Deploy Curve Token
  const threeCrv = (await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
    THREE_CRV_TOKEN_ADDRESS
  )) as ERC20;

  const crvDUSD = (await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
    CRV_DUSD_TOKEN_ADDRESS
  )) as ERC20;

  const crvFRAX = (await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
    CRV_FRAX_TOKEN_ADDRESS
  )) as ERC20;

  const crvUSDN = (await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
    CRV_USDN_TOKEN_ADDRESS
  )) as ERC20;

  const crvUST = (await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
    CRV_UST_TOKEN_ADDRESS
  )) as ERC20;

  const threePool = (await ethers.getContractAt(
    CurveMetapoolAbi,
    THREEPOOL_ADDRESS
  )) as CurveMetapool;

  //Deploy Curve Metapool
  const dusdMetapool = (await ethers.getContractAt(
    CurveMetapoolAbi,
    DUSD_METAPOOL_ADDRESS
  )) as CurveMetapool;

  const fraxMetapool = (await ethers.getContractAt(
    CurveMetapoolAbi,
    FRAX_METAPOOL_ADDRESS
  )) as CurveMetapool;

  const usdnMetapool = (await ethers.getContractAt(
    CurveMetapoolAbi,
    USDN_METAPOOL_ADDRESS
  )) as CurveMetapool;

  const ustMetapool = (await ethers.getContractAt(
    CurveMetapoolAbi,
    UST_METAPOOL_ADDRESS
  )) as CurveMetapool;

  //Deploy Yearn Vaults
  const yDUSD = (await ethers.getContractAt(
    "MockYearnV2Vault",
    YDUSD_TOKEN_ADDRESS
  )) as MockYearnV2Vault;

  const yFRAX = (await ethers.getContractAt(
    "MockYearnV2Vault",
    YFRAX_TOKEN_ADDRESS
  )) as MockYearnV2Vault;

  const yUSDN = (await ethers.getContractAt(
    "MockYearnV2Vault",
    YUSDN_TOKEN_ADDRESS
  )) as MockYearnV2Vault;

  const yUST = (await ethers.getContractAt(
    "MockYearnV2Vault",
    YUST_TOKEN_ADDRESS
  )) as MockYearnV2Vault;

  componentMap[YDUSD_TOKEN_ADDRESS].metaPool = dusdMetapool;
  componentMap[YDUSD_TOKEN_ADDRESS].yPool = yDUSD;
  componentMap[YFRAX_TOKEN_ADDRESS].metaPool = fraxMetapool;
  componentMap[YFRAX_TOKEN_ADDRESS].yPool = yFRAX;
  componentMap[YUSDN_TOKEN_ADDRESS].metaPool = usdnMetapool;
  componentMap[YUSDN_TOKEN_ADDRESS].yPool = yUSDN;
  componentMap[YUST_TOKEN_ADDRESS].metaPool = ustMetapool;
  componentMap[YUST_TOKEN_ADDRESS].yPool = yUST;

  //Deploy Set Procotol
  const hysi = (await ethers.getContractAt(
    SetTokenAbi.abi,
    HYSI_TOKEN_ADDRESS
  )) as unknown as SetToken;

  const basicIssuanceModule = (await ethers.getContractAt(
    BasicIssuanceModuleAbi.abi,
    SET_BASIC_ISSUANCE_MODULE_ADDRESS
  )) as unknown as BasicIssuanceModule;

  const aclRegistry = await (
    await (await ethers.getContractFactory("ACLRegistry")).deploy()
  ).deployed();

  const contractRegistry = await (
    await (
      await ethers.getContractFactory("ContractRegistry")
    ).deploy(aclRegistry.address)
  ).deployed();

  const keeperIncentive = await (
    await (
      await ethers.getContractFactory("KeeperIncentive")
    ).deploy(contractRegistry.address, 0, 0)
  ).deployed();

  const staking = await (
    await (
      await ethers.getContractFactory("Staking")
    ).deploy(contractRegistry.address)
  ).deployed();

  //Deploy HysiBatchInteraction
  const HysiBatchInteraction = await ethers.getContractFactory(
    "HysiBatchInteraction"
  );
  const hysiBatchInteraction = await (
    await HysiBatchInteraction.deploy(
      contractRegistry.address,
      HYSI_TOKEN_ADDRESS,
      THREE_CRV_TOKEN_ADDRESS,
      SET_BASIC_ISSUANCE_MODULE_ADDRESS,
      [
        YDUSD_TOKEN_ADDRESS,
        YFRAX_TOKEN_ADDRESS,
        YUSDN_TOKEN_ADDRESS,
        YUST_TOKEN_ADDRESS,
      ],
      [
        {
          curveMetaPool: DUSD_METAPOOL_ADDRESS,
          crvLPToken: CRV_DUSD_TOKEN_ADDRESS,
        },
        {
          curveMetaPool: FRAX_METAPOOL_ADDRESS,
          crvLPToken: CRV_FRAX_TOKEN_ADDRESS,
        },
        {
          curveMetaPool: USDN_METAPOOL_ADDRESS,
          crvLPToken: CRV_USDN_TOKEN_ADDRESS,
        },
        {
          curveMetaPool: UST_METAPOOL_ADDRESS,
          crvLPToken: CRV_UST_TOKEN_ADDRESS,
        },
      ],
      2500,
      parseEther("200"),
      parseEther("1")
    )
  ).deployed();

  return {
    mockPop,
    threeCrv,
    crvDUSD,
    crvFRAX,
    crvUSDN,
    crvUST,
    threePool,
    dusdMetapool,
    fraxMetapool,
    usdnMetapool,
    ustMetapool,
    yDUSD,
    yFRAX,
    yUSDN,
    yUST,
    hysi,
    setToken: hysi,
    basicIssuanceModule,
    hysiBatchInteraction,
    staking,
    keeperIncentive,
    faucet,
    aclRegistry,
    contractRegistry,
  };
}
const getMinAmountOfHYSIToMint = async (): Promise<BigNumber> => {
  const batchId = await contracts.hysiBatchInteraction.currentMintBatchId();
  // get expected units of HYSI given 3crv amount:
  const threeCrvInBatch = (
    await contracts.hysiBatchInteraction.batches(batchId)
  ).suppliedTokenBalance;
  const valueOf3CrvInBatch = threeCrvInBatch.mul(
    await contracts.threePool.get_virtual_price()
  );
  const components =
    await contracts.basicIssuanceModule.getRequiredComponentUnitsForIssue(
      HYSI_TOKEN_ADDRESS,
      parseEther("1")
    );
  const componentAddresses = components[0];
  const componentAmounts = components[1];

  const componentVirtualPrices = (await Promise.all(
    componentAddresses.map(async (component) => {
      const metapool = componentMap[component.toLowerCase()]
        .metaPool as CurveMetapool;
      const yPool = componentMap[component.toLowerCase()]
        .yPool as MockYearnV2Vault;
      const yPoolPricePerShare = await yPool.pricePerShare();
      const metapoolPrice = await metapool.get_virtual_price();
      return yPoolPricePerShare.mul(metapoolPrice).div(parseEther("1"));
    })
  )) as BigNumber[];

  const componentValuesInUSD = componentVirtualPrices.reduce(
    (sum, componentPrice, i) => {
      return sum.add(componentPrice.mul(componentAmounts[i]));
    },
    parseEther("0")
  );

  const HYSI_toMint = valueOf3CrvInBatch
    .mul(parseEther("1"))
    .div(componentValuesInUSD);

  const minAmountToMint = HYSI_toMint.mul(parseEther(".995")).div(
    parseEther("1")
  );
  return minAmountToMint;
};

const getMinAmountOf3CrvToReceive = async (
  slippage: number = 0.005
): Promise<BigNumber> => {
  const batchId = await contracts.hysiBatchInteraction.currentRedeemBatchId();

  // get expected units of HYSI given 3crv amount:
  const HYSIInBatch = (await contracts.hysiBatchInteraction.batches(batchId))
    .suppliedTokenBalance;

  const components =
    await contracts.basicIssuanceModule.getRequiredComponentUnitsForIssue(
      HYSI_TOKEN_ADDRESS,
      HYSIInBatch
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
    (sum: BigNumber, componentPrice: BigNumber, i) => {
      return sum.add(
        componentPrice.mul(componentAmounts[i]).div(parseEther("1"))
      );
    },
    parseEther("0")
  ) as BigNumber;

  // 50 bps slippage tolerance
  const slippageTolerance = 1 - Number(slippage);
  const minAmountToReceive = componentValuesInUSD
    .mul(parseEther(slippageTolerance.toString()))
    .div(parseEther("1"));
  return minAmountToReceive;
};

async function depositForHysiMint(
  account: SignerWithAddress,
  threeCrvAmount: BigNumber
): Promise<void> {
  await contracts.threeCrv
    .connect(account)
    .approve(contracts.hysiBatchInteraction.address, threeCrvAmount);
  await contracts.hysiBatchInteraction
    .connect(account)
    .depositForMint(threeCrvAmount, account.address);
}

async function distributeHysiToken(): Promise<void> {
  await depositForHysiMint(depositor, parseEther("100"));
  await depositForHysiMint(depositor1, parseEther("100"));
  await depositForHysiMint(depositor2, parseEther("100"));
  await depositForHysiMint(depositor3, parseEther("100"));

  await provider.send("evm_increaseTime", [2500]);
  await provider.send("evm_mine", []);

  await contracts.hysiBatchInteraction.connect(owner).batchMint(0);
  const [depositId] = await contracts.hysiBatchInteraction.getAccountBatches(
    depositor.address
  );
  await contracts.hysiBatchInteraction
    .connect(depositor)
    .claim(depositId, depositor.address);
  await contracts.hysiBatchInteraction
    .connect(depositor1)
    .claim(depositId, depositor1.address);
  await contracts.hysiBatchInteraction
    .connect(depositor2)
    .claim(depositId, depositor2.address);
  await contracts.hysiBatchInteraction
    .connect(depositor3)
    .claim(depositId, depositor3.address);

  hysiBalance = await contracts.hysi.balanceOf(depositor.address);

  await contracts.hysi
    .connect(depositor)
    .approve(
      contracts.hysiBatchInteraction.address,
      parseEther("100000000000")
    );
  await contracts.hysi
    .connect(depositor1)
    .approve(
      contracts.hysiBatchInteraction.address,
      parseEther("100000000000")
    );
  await contracts.hysi
    .connect(depositor2)
    .approve(
      contracts.hysiBatchInteraction.address,
      parseEther("100000000000")
    );
  await contracts.hysi
    .connect(depositor3)
    .approve(
      contracts.hysiBatchInteraction.address,
      parseEther("100000000000")
    );
}

describe("HysiBatchInteraction Network Test", function () {
  before(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.FORKING_RPC_URL,
            blockNumber: 13206601,
          },
        },
      ],
    });
  });

  beforeEach(async function () {
    [owner, depositor, depositor1, depositor2, depositor3] =
      await ethers.getSigners();
    contracts = await deployContracts();
    [depositor, depositor1, depositor2, depositor3].forEach(async (account) => {
      await contracts.faucet.sendThreeCrv(10000, account.address);
    });
    await contracts.aclRegistry.grantRole(
      ethers.utils.id("DAO"),
      owner.address
    );
    await contracts.aclRegistry.grantRole(
      ethers.utils.id("Keeper"),
      owner.address
    );

    await contracts.contractRegistry
      .connect(owner)
      .addContract(
        ethers.utils.id("POP"),
        contracts.mockPop.address,
        ethers.utils.id("1")
      );
    await contracts.contractRegistry
      .connect(owner)
      .addContract(
        ethers.utils.id("KeeperIncentive"),
        contracts.keeperIncentive.address,
        ethers.utils.id("1")
      );
    await contracts.contractRegistry
      .connect(owner)
      .addContract(
        ethers.utils.id("Staking"),
        contracts.staking.address,
        ethers.utils.id("1")
      );

    await contracts.keeperIncentive
      .connect(owner)
      .createIncentive(
        utils.formatBytes32String("HysiBatchInteraction"),
        0,
        true,
        false
      );
    await contracts.keeperIncentive
      .connect(owner)
      .createIncentive(
        utils.formatBytes32String("HysiBatchInteraction"),
        0,
        true,
        false
      );

    await contracts.keeperIncentive
      .connect(owner)
      .addControllerContract(
        utils.formatBytes32String("HysiBatchInteraction"),
        contracts.hysiBatchInteraction.address
      );
  });

  context("setters and getters", () => {
    describe("setCurvePoolTokenPairs", () => {
      it("sets curve pool token pairs", async () => {
        await contracts.hysiBatchInteraction.setCurvePoolTokenPairs(
          [YUST_TOKEN_ADDRESS],
          [
            {
              curveMetaPool: UST_METAPOOL_ADDRESS,
              crvLPToken: CRV_UST_TOKEN_ADDRESS,
            },
          ]
        );
        expect(
          await contracts.hysiBatchInteraction.curvePoolTokenPairs(
            YUST_TOKEN_ADDRESS
          )
        ).to.deep.eq([UST_METAPOOL_ADDRESS, CRV_UST_TOKEN_ADDRESS]);
      });
    });
  });

  describe("mint", function () {
    context("depositing", function () {
      it("deposits 3crv in the current mintBatch", async function () {
        await contracts.threeCrv
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
        expect(
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForMint(parseEther("10"), depositor.address)
        )
          .to.emit(contracts.hysiBatchInteraction, "Deposit")
          .withArgs(depositor.address, parseEther("10"));
        expect(
          await contracts.threeCrv.balanceOf(
            contracts.hysiBatchInteraction.address
          )
        ).to.equal(parseEther("10"));
        const currentMintBatchId =
          await contracts.hysiBatchInteraction.currentMintBatchId();
        const currentBatch = await contracts.hysiBatchInteraction.batches(
          currentMintBatchId
        );
        expect(currentBatch.suppliedTokenBalance).to.equal(parseEther("10"));
        expect(currentBatch.unclaimedShares).to.equal(parseEther("10"));
      });
      it("adds the mintBatch to the users batches", async function () {
        await contracts.threeCrv
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForMint(parseEther("100"), depositor.address);

        const currentMintBatchId =
          await contracts.hysiBatchInteraction.currentMintBatchId();
        expect(
          await contracts.hysiBatchInteraction.accountBatches(
            depositor.address,
            0
          )
        ).to.equal(currentMintBatchId);
      });
      it("allows multiple deposits", async function () {
        await contracts.threeCrv
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForMint(parseEther("100"), depositor.address);
        await contracts.threeCrv
          .connect(depositor1)
          .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
        await contracts.hysiBatchInteraction
          .connect(depositor1)
          .depositForMint(parseEther("100"), depositor1.address);
        await contracts.threeCrv
          .connect(depositor2)
          .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
        await contracts.hysiBatchInteraction
          .connect(depositor2)
          .depositForMint(parseEther("50"), depositor2.address);
        await contracts.hysiBatchInteraction
          .connect(depositor2)
          .depositForMint(parseEther("50"), depositor2.address);
        const currentMintBatchId =
          await contracts.hysiBatchInteraction.currentMintBatchId();
        const currentBatch = await contracts.hysiBatchInteraction.batches(
          currentMintBatchId
        );
        expect(currentBatch.suppliedTokenBalance).to.equal(parseEther("300"));
        expect(currentBatch.unclaimedShares).to.equal(parseEther("300"));
        expect(
          await contracts.hysiBatchInteraction.accountBatches(
            depositor.address,
            0
          )
        ).to.equal(currentMintBatchId);
        expect(
          await contracts.hysiBatchInteraction.accountBatches(
            depositor1.address,
            0
          )
        ).to.equal(currentMintBatchId);
        expect(
          await contracts.hysiBatchInteraction.accountBatches(
            depositor2.address,
            0
          )
        ).to.equal(currentMintBatchId);
      });
    });
    context("withdraw from queue", function () {
      beforeEach(async function () {
        await contracts.threeCrv
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForMint(parseEther("100"), depositor.address);
      });
      context("revert", function () {
        it("reverts when the batch was already minted", async function () {
          const [batchId] =
            await contracts.hysiBatchInteraction.getAccountBatches(
              depositor.address
            );
          await provider.send("evm_increaseTime", [2500]);
          await provider.send("evm_mine", []);
          await contracts.hysiBatchInteraction.batchMint(0);
          await expect(
            contracts.hysiBatchInteraction
              .connect(depositor)
              .withdrawFromBatch(batchId, parseEther("10"), depositor.address)
          ).to.be.revertedWith("already processed");
        });
        it("reverts when trying to withdraw more than deposited", async function () {
          const [batchId] =
            await contracts.hysiBatchInteraction.getAccountBatches(
              depositor.address
            );

          await expect(
            contracts.hysiBatchInteraction
              .connect(depositor)
              .withdrawFromBatch(batchId, parseEther("101"), depositor.address)
          ).to.be.revertedWith("account has insufficient funds");
        });
      });
      context("sucess", function () {
        it("withdraws the deposit", async function () {
          const [batchId] =
            await contracts.hysiBatchInteraction.getAccountBatches(
              depositor.address
            );
          const balance = await contracts.threeCrv.balanceOf(depositor.address);
          expect(
            await contracts.hysiBatchInteraction
              .connect(depositor)
              .withdrawFromBatch(batchId, parseEther("100"), depositor.address)
          )
            .to.emit(contracts.hysiBatchInteraction, "WithdrawnFromBatch")
            .withArgs(batchId, parseEther("100"), depositor.address);
          expect(
            await contracts.threeCrv.balanceOf(depositor.address)
          ).to.equal(balance.add(parseEther("100")));
        });
        it("withdraws part of the deposit and continues to mint the rest", async function () {
          const [batchId] =
            await contracts.hysiBatchInteraction.getAccountBatches(
              depositor.address
            );
          const amountToWithdraw = parseEther("50");

          const suppliedTokenBalanceBefore = (
            await contracts.hysiBatchInteraction.batches(batchId)
          ).suppliedTokenBalance;

          const expectedSuppliedTokenAfter = suppliedTokenBalanceBefore.sub(
            parseEther("50")
          );

          expect(
            await contracts.hysiBatchInteraction
              .connect(depositor)
              .withdrawFromBatch(batchId, amountToWithdraw, depositor.address)
          ).to.emit(contracts.hysiBatchInteraction, "WithdrawnFromBatch");

          const suppliedTokenBalanceAfter = (
            await contracts.hysiBatchInteraction.batches(batchId)
          ).suppliedTokenBalance;

          expect(suppliedTokenBalanceAfter).to.equal(
            expectedSuppliedTokenAfter
          );
          expect(
            suppliedTokenBalanceAfter.lt(suppliedTokenBalanceBefore)
          ).to.be.true;

          await provider.send("evm_increaseTime", [2500]);
          await provider.send("evm_mine", []);

          expect(await contracts.hysiBatchInteraction.batchMint(0)).to.emit(
            contracts.hysiBatchInteraction,
            "BatchMinted"
          );
        });
      });
    });
    context("batch minting", function () {
      context("reverts", function () {
        it("reverts when minting too early", async function () {
          await contracts.threeCrv
            .connect(depositor)
            .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForMint(parseEther("100"), depositor.address);
          await expect(
            contracts.hysiBatchInteraction.connect(owner).batchMint(0)
          ).to.be.revertedWith("can not execute batch action yet");
        });
        it("reverts when called by someone other the keeper", async function () {
          await contracts.threeCrv
            .connect(depositor)
            .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForMint(parseEther("100"), depositor.address);
          await provider.send("evm_increaseTime", [2500]);

          await expect(
            contracts.hysiBatchInteraction.connect(depositor).batchMint(0)
          ).to.be.revertedWith("you dont have the right role");
        });
      });
      context("success", function () {
        it("batch mints", async function () {
          this.timeout(45000);
          const batchId =
            await contracts.hysiBatchInteraction.currentMintBatchId();

          await contracts.threeCrv
            .connect(depositor)
            .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForMint(parseEther("100"), depositor.address);
          await provider.send("evm_increaseTime", [2500]);
          await provider.send("evm_mine", []);

          const minAmount = await getMinAmountOfHYSIToMint();

          const result = await contracts.hysiBatchInteraction
            .connect(owner)
            .batchMint(minAmount);
          expect(result).to.emit(contracts.hysiBatchInteraction, "BatchMinted");
        });
        it("mints early when mintThreshold is met", async function () {
          this.timeout(45000);
          await contracts.threeCrv
            .connect(depositor)
            .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForMint(parseEther("100"), depositor.address);
          await contracts.threeCrv
            .connect(depositor1)
            .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
          await contracts.hysiBatchInteraction
            .connect(depositor1)
            .depositForMint(parseEther("100"), depositor1.address);
          await expect(
            contracts.hysiBatchInteraction.connect(owner).batchMint(0)
          ).to.emit(contracts.hysiBatchInteraction, "BatchMinted");
        });
        it("advances to the next batch", async function () {
          await contracts.threeCrv
            .connect(depositor)
            .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForMint(parseEther("100"), depositor.address);
          await provider.send("evm_increaseTime", [2500]);

          const previousMintBatchId =
            await contracts.hysiBatchInteraction.currentMintBatchId();
          await contracts.hysiBatchInteraction.batchMint(0);

          const previousBatch = await contracts.hysiBatchInteraction.batches(
            previousMintBatchId
          );
          expect(previousBatch.claimable).to.equal(true);

          const currentMintBatchId =
            await contracts.hysiBatchInteraction.currentMintBatchId();
          expect(currentMintBatchId).to.not.equal(previousMintBatchId);
        });
      });
    });
    context("claim batch", function () {
      beforeEach(async function () {
        await contracts.threeCrv
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForMint(parseEther("100"), depositor.address);
        await contracts.threeCrv
          .connect(depositor1)
          .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
        await contracts.hysiBatchInteraction
          .connect(depositor1)
          .depositForMint(parseEther("100"), depositor1.address);
        await contracts.threeCrv
          .connect(depositor2)
          .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
        await contracts.hysiBatchInteraction
          .connect(depositor2)
          .depositForMint(parseEther("100"), depositor2.address);
        await contracts.threeCrv
          .connect(depositor3)
          .approve(contracts.hysiBatchInteraction.address, parseEther("100"));
        await contracts.hysiBatchInteraction
          .connect(depositor3)
          .depositForMint(parseEther("100"), depositor3.address);
      });
      it("reverts when batch is not yet claimable", async function () {
        const [batchId] =
          await contracts.hysiBatchInteraction.getAccountBatches(
            depositor.address
          );
        await expect(
          contracts.hysiBatchInteraction
            .connect(depositor)
            .claim(batchId, depositor.address)
        ).to.be.revertedWith("not yet claimable");
      });
      it("claim batch successfully", async function () {
        const hysiBalanceBefore = await contracts.hysi.balanceOf(
          depositor.address
        );

        const [batchId] =
          await contracts.hysiBatchInteraction.getAccountBatches(
            depositor.address
          );

        await provider.send("evm_increaseTime", [2500]);
        await provider.send("evm_mine", []);
        await contracts.hysiBatchInteraction.connect(owner).batchMint(0);

        const amountToReceive = await new HysiBatchInteractionAdapter(
          contracts.hysiBatchInteraction
        ).calculateAmountToReceiveForClaim(batchId, depositor.address);

        const batchTest = await contracts.hysiBatchInteraction.batches(batchId);

        expect(
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .claim(batchId, depositor.address)
        )
          .to.emit(contracts.hysiBatchInteraction, "Claimed")
          .withArgs(
            depositor.address,
            BatchType.Mint,
            parseEther("100"),
            amountToReceive
          );

        const hysiBalanceAfter = await contracts.hysi.balanceOf(
          depositor.address
        );

        expect(hysiBalanceAfter.gt(hysiBalanceBefore)).to.be.true;
        expect(hysiBalanceAfter.sub(hysiBalanceBefore)).to.equal(
          amountToReceive
        );
        const batch = await contracts.hysiBatchInteraction.batches(batchId);
        expect(batch.unclaimedShares).to.equal(parseEther("300"));
      });
    });
  });
  describe("redeem", function () {
    beforeEach(async function () {
      await distributeHysiToken();
    });
    context("depositing", function () {
      it("deposits setToken in the current redeemBatch", async function () {
        const result = await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForRedeem(hysiBalance);
        expect(result)
          .to.emit(contracts.hysiBatchInteraction, "Deposit")
          .withArgs(depositor.address, hysiBalance);
        expect(
          await contracts.hysi.balanceOf(contracts.hysiBatchInteraction.address)
        ).to.equal(hysiBalance);
        const currentRedeemBatchId =
          await contracts.hysiBatchInteraction.currentRedeemBatchId();
        const currentBatch = await contracts.hysiBatchInteraction.batches(
          currentRedeemBatchId
        );
        expect(currentBatch.suppliedTokenBalance).to.equal(hysiBalance);
        expect(currentBatch.unclaimedShares).to.equal(hysiBalance);
      });
      it("adds the redeemBatch to the users batches", async function () {
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForRedeem(hysiBalance);

        const currentRedeemBatchId =
          await contracts.hysiBatchInteraction.currentRedeemBatchId();
        expect(
          await contracts.hysiBatchInteraction.accountBatches(
            depositor.address,
            1
          )
        ).to.equal(currentRedeemBatchId);
      });
      it("allows multiple deposits", async function () {
        this.timeout(25000);
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForRedeem(hysiBalance);
        await contracts.hysiBatchInteraction
          .connect(depositor1)
          .depositForRedeem(hysiBalance);
        await contracts.hysiBatchInteraction
          .connect(depositor2)
          .depositForRedeem(hysiBalance.div(2));
        await contracts.hysiBatchInteraction
          .connect(depositor3)
          .depositForRedeem(hysiBalance.div(2));
        const currentRedeemBatchId =
          await contracts.hysiBatchInteraction.currentRedeemBatchId();
        const currentBatch = await contracts.hysiBatchInteraction.batches(
          currentRedeemBatchId
        );
        expect(currentBatch.suppliedTokenBalance).to.equal(
          hysiBalance.mul(2).add(hysiBalance.div(2).mul(2)) // deposited 300 hysi
        );
        expect(currentBatch.unclaimedShares).to.equal(
          hysiBalance.mul(2).add(hysiBalance.div(2).mul(2))
        );
        expect(
          await contracts.hysiBatchInteraction.accountBatches(
            depositor.address,
            1
          )
        ).to.equal(currentRedeemBatchId);
        expect(
          await contracts.hysiBatchInteraction.accountBatches(
            depositor1.address,
            1
          )
        ).to.equal(currentRedeemBatchId);
        expect(
          await contracts.hysiBatchInteraction.accountBatches(
            depositor2.address,
            1
          )
        ).to.equal(currentRedeemBatchId);
      });
    });
    context("withdraw from queue", function () {
      beforeEach(async function () {
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForRedeem(hysiBalance);
      });
      context("revert", function () {
        it("reverts when the batch was already redeemed", async function () {
          const [, batchId] =
            await contracts.hysiBatchInteraction.getAccountBatches(
              depositor.address
            );
          await provider.send("evm_increaseTime", [2500]);
          await provider.send("evm_mine", []);
          await contracts.hysiBatchInteraction.batchRedeem(0);
          await expect(
            contracts.hysiBatchInteraction
              .connect(depositor)
              .withdrawFromBatch(batchId, hysiBalance, depositor.address)
          ).to.be.revertedWith("already processed");
        });
      });
      context("sucess", function () {
        it("withdraws the deposit", async function () {
          const [, batchId] =
            await contracts.hysiBatchInteraction.getAccountBatches(
              depositor.address
            );
          expect(
            await contracts.hysiBatchInteraction
              .connect(depositor)
              .withdrawFromBatch(batchId, hysiBalance, depositor.address)
          )
            .to.emit(contracts.hysiBatchInteraction, "WithdrawnFromBatch")
            .withArgs(batchId, hysiBalance, depositor.address);
          expect(await contracts.hysi.balanceOf(depositor.address)).to.equal(
            hysiBalance
          );
        });
        it("withdraws part of the deposit and continues to redeem the rest", async function () {
          const [, batchId] =
            await contracts.hysiBatchInteraction.getAccountBatches(
              depositor.address
            );
          const suppliedTokenBalanceBefore =
            await contracts.hysiBatchInteraction.batches(batchId);
          const unclaimedSharesBefore = (
            await contracts.hysiBatchInteraction.batches(batchId)
          ).unclaimedShares;

          expect(
            await contracts.hysiBatchInteraction
              .connect(depositor)
              .withdrawFromBatch(batchId, hysiBalance.div(2), depositor.address)
          ).to.emit(contracts.hysiBatchInteraction, "WithdrawnFromBatch");
          await provider.send("evm_increaseTime", [2500]);
          await provider.send("evm_mine", []);
          const unclaimedSharesAfter = (
            await contracts.hysiBatchInteraction.batches(batchId)
          ).unclaimedShares;

          expect(unclaimedSharesBefore.gt(unclaimedSharesAfter)).to.be.true;
          expect(unclaimedSharesBefore.sub(unclaimedSharesAfter)).to.equal(
            hysiBalance.div(2)
          );
          expect(await contracts.hysiBatchInteraction.batchRedeem(0)).to.emit(
            contracts.hysiBatchInteraction,
            "BatchRedeemed"
          );
        });
      });
    });

    context("batch redeeming", function () {
      context("reverts", function () {
        it("reverts when redeeming too early", async function () {
          this.timeout(25000);
          await contracts.hysiBatchInteraction.setBatchCooldown(5000);
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForRedeem(hysiBalance);

          await expect(
            contracts.hysiBatchInteraction.connect(owner).batchRedeem(0)
          ).to.be.revertedWith("can not execute batch action yet");
        });
        it("reverts when called by someone other the keeper", async function () {
          await contracts.hysi
            .connect(depositor)
            .approve(contracts.hysiBatchInteraction.address, hysiBalance);
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForRedeem(hysiBalance);
          await provider.send("evm_increaseTime", [2500]);

          await expect(
            contracts.hysiBatchInteraction.connect(depositor).batchRedeem(0)
          ).to.be.revertedWith("you dont have the right role");
        });
        it("reverts when amount of 3crv to receive is less than slippage tolerance", async function () {
          this.timeout(25000);

          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForRedeem(hysiBalance);

          await provider.send("evm_increaseTime", [2500]);
          await provider.send("evm_mine", []);

          const minAmount =
            await HysiBatchInteractionAdapter.getMinAmountOf3CrvToReceiveForBatchRedeem(
              0.0001,
              {
                hysiBatchInteraction: contracts.hysiBatchInteraction,
                basicIssuanceModule: contracts.basicIssuanceModule,
                setToken: contracts.hysi,
              },
              componentMap
            );

          await expect(
            contracts.hysiBatchInteraction.connect(owner).batchRedeem(minAmount)
          ).to.be.revertedWith("slippage too high");
        });
      });
      context("success", function () {
        it("batch emits a BatchRedeemedEvent", async function () {
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForRedeem(hysiBalance);
          await provider.send("evm_increaseTime", [2500]);
          await provider.send("evm_mine", []);

          const min3Crv =
            await HysiBatchInteractionAdapter.getMinAmountOf3CrvToReceiveForBatchRedeem(
              0.0046,
              {
                hysiBatchInteraction: contracts.hysiBatchInteraction,
                basicIssuanceModule: contracts.basicIssuanceModule,
                setToken: contracts.hysi,
              },
              componentMap
            );
          const result = await contracts.hysiBatchInteraction
            .connect(owner)
            .batchRedeem(min3Crv);
          expect(result).to.emit(
            contracts.hysiBatchInteraction,
            "BatchRedeemed"
          );
        });

        it("transfers a minimum amount of 3crv to the contract", async function () {
          const batchId =
            await contracts.hysiBatchInteraction.currentRedeemBatchId();
          const contractBalanceBefore = await contracts.threeCrv.balanceOf(
            contracts.hysiBatchInteraction.address
          );
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForRedeem(hysiBalance);
          await provider.send("evm_increaseTime", [2500]);
          await provider.send("evm_mine", []);

          const min3Crv =
            await HysiBatchInteractionAdapter.getMinAmountOf3CrvToReceiveForBatchRedeem(
              0.0046,
              {
                hysiBatchInteraction: contracts.hysiBatchInteraction,
                basicIssuanceModule: contracts.basicIssuanceModule,
                setToken: contracts.hysi,
              },
              componentMap
            );

          const result = await contracts.hysiBatchInteraction
            .connect(owner)
            .batchRedeem(min3Crv);

          const contractBalanceAfter = await contracts.threeCrv.balanceOf(
            contracts.hysiBatchInteraction.address
          );
          const received3crv = contractBalanceAfter.sub(contractBalanceBefore);

          expect(received3crv.gte(min3Crv)).to.be.true;
        });

        it("increments claimableTokenBalance by an amount equal to amount transfered", async function () {
          const batchId =
            await contracts.hysiBatchInteraction.currentRedeemBatchId();
          const contractBalanceBefore = await contracts.threeCrv.balanceOf(
            contracts.hysiBatchInteraction.address
          );
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForRedeem(hysiBalance);
          await provider.send("evm_increaseTime", [2500]);
          await provider.send("evm_mine", []);

          const min3Crv =
            await HysiBatchInteractionAdapter.getMinAmountOf3CrvToReceiveForBatchRedeem(
              0.0046,
              {
                hysiBatchInteraction: contracts.hysiBatchInteraction,
                basicIssuanceModule: contracts.basicIssuanceModule,
                setToken: contracts.hysi,
              },
              componentMap
            );

          const result = await contracts.hysiBatchInteraction
            .connect(owner)
            .batchRedeem(min3Crv);

          const contractBalanceAfter = await contracts.threeCrv.balanceOf(
            contracts.hysiBatchInteraction.address
          );
          const received3crv = contractBalanceAfter.sub(contractBalanceBefore);
          expect(
            (
              await contracts.hysiBatchInteraction.batches(batchId)
            ).claimableTokenBalance.eq(received3crv)
          ).to.be.true;
          expect(received3crv.gte(min3Crv)).to.be.true;
        });

        it("transfers to a claimant an amount equal to their share in batch", async function () {
          const batchId =
            await contracts.hysiBatchInteraction.currentRedeemBatchId();
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForRedeem(hysiBalance);

          await provider.send("evm_increaseTime", [2500]);
          await provider.send("evm_mine", []);

          const min3Crv =
            await HysiBatchInteractionAdapter.getMinAmountOf3CrvToReceiveForBatchRedeem(
              0.0046,
              {
                hysiBatchInteraction: contracts.hysiBatchInteraction,
                basicIssuanceModule: contracts.basicIssuanceModule,
                setToken: contracts.hysi,
              },
              componentMap
            );

          const result = await contracts.hysiBatchInteraction
            .connect(owner)
            .batchRedeem(min3Crv);

          const accountBalanceBefore = await contracts.threeCrv.balanceOf(
            contracts.hysiBatchInteraction.address
          );

          const adapter = new HysiBatchInteractionAdapter(
            contracts.hysiBatchInteraction
          );

          const amountToReceive =
            await adapter.calculateAmountToReceiveForClaim(
              batchId,
              depositor.address
            );

          await contracts.hysiBatchInteraction
            .connect(depositor)
            .claim(batchId, depositor.address);

          const accountBalanceAfter = await contracts.threeCrv.balanceOf(
            contracts.hysiBatchInteraction.address
          );

          expect(amountToReceive).to.equal(
            accountBalanceBefore.sub(accountBalanceAfter)
          );
        });

        it("mints early when redeemThreshold is met", async function () {
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForRedeem(hysiBalance);
          await contracts.hysiBatchInteraction
            .connect(depositor1)
            .depositForRedeem(hysiBalance);
          await contracts.hysiBatchInteraction
            .connect(depositor2)
            .depositForRedeem(hysiBalance);
          const result = await contracts.hysiBatchInteraction
            .connect(owner)
            .batchRedeem(0);
          expect(result).to.emit(
            contracts.hysiBatchInteraction,
            "BatchRedeemed"
          );
        });
        it("advances to the next batch", async function () {
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .depositForRedeem(hysiBalance);
          await provider.send("evm_increaseTime", [2500]);
          await provider.send("evm_mine", []);
          const previousRedeemBatchId =
            await contracts.hysiBatchInteraction.currentRedeemBatchId();
          await contracts.hysiBatchInteraction.batchRedeem(0);

          const previousBatch = await contracts.hysiBatchInteraction.batches(
            previousRedeemBatchId
          );
          expect(previousBatch.claimable).to.equal(true);

          const currentRedeemBatchId =
            await contracts.hysiBatchInteraction.currentRedeemBatchId();
          expect(currentRedeemBatchId).to.not.equal(previousRedeemBatchId);
        });
      });
    });
    context("claim batch", function () {
      it("reverts when batch is not yet claimable", async function () {
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForRedeem(hysiBalance);
        const [, batchId] =
          await contracts.hysiBatchInteraction.getAccountBatches(
            depositor.address
          );
        await expect(
          contracts.hysiBatchInteraction
            .connect(depositor)
            .claim(batchId, depositor.address)
        ).to.be.revertedWith("not yet claimable");
      });
      it("claim batch successfully", async function () {
        const threeCrvBalanceBefore = await contracts.threeCrv.balanceOf(
          depositor.address
        );
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForRedeem(hysiBalance);
        await provider.send("evm_increaseTime", [2500]);
        await provider.send("evm_mine", []);
        await contracts.hysiBatchInteraction.connect(owner).batchRedeem(0);
        const [, batchId] =
          await contracts.hysiBatchInteraction.getAccountBatches(
            depositor.address
          );
        const amountToReceive = await new HysiBatchInteractionAdapter(
          contracts.hysiBatchInteraction
        ).calculateAmountToReceiveForClaim(batchId, depositor.address);

        expect(
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .claim(batchId, depositor.address)
        )
          .to.emit(contracts.hysiBatchInteraction, "Claimed")
          .withArgs(
            depositor.address,
            BatchType.Redeem,
            hysiBalance,
            amountToReceive
          );

        const threeCrvBalanceAfter = await contracts.threeCrv.balanceOf(
          depositor.address
        );

        expect(threeCrvBalanceAfter.gt(threeCrvBalanceBefore)).to.be.true;
        expect(threeCrvBalanceAfter.sub(threeCrvBalanceBefore)).to.equal(
          amountToReceive
        );
        const batch = await contracts.hysiBatchInteraction.batches(batchId);
        expect(batch.unclaimedShares).to.equal(0);
      });
    });
  });
  context("moveUnclaimedDepositsIntoCurrentBatch", function () {
    context("error", function () {
      it("reverts when length of batchIds and shares are not matching", async function () {
        await expect(
          contracts.hysiBatchInteraction
            .connect(depositor)
            .moveUnclaimedDepositsIntoCurrentBatch(
              new Array(2).fill(
                "0xa15f699e141c27ed0edace41ff8fa7b836e3ddb658b25c811a1674e9c7a75c5c"
              ),
              new Array(3).fill(parseEther("10")),
              BatchType.Mint
            )
        ).to.be.revertedWith("array lengths must match");
      });
      it("skips a batch that is not from the correct batchType", async function () {
        await contracts.threeCrv
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("10000"));
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForMint(parseEther("10000"), depositor.address);

        await provider.send("evm_increaseTime", [2500]);
        await provider.send("evm_mine", []);
        await contracts.hysiBatchInteraction.connect(owner).batchMint(0);
        const batchId = await contracts.hysiBatchInteraction.getAccountBatches(
          depositor.address
        );
        await expect(
          contracts.hysiBatchInteraction.moveUnclaimedDepositsIntoCurrentBatch(
            [batchId[0]],
            [parseEther("10000")],
            BatchType.Redeem
          )
        ).to.be.revertedWith("incorrect batchType");
      });
      it("skips unclaimable batch", async function () {
        this.timeout(60000);
        await contracts.threeCrv
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("10000"));

        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForMint(parseEther("10000"), depositor.address);

        const batchIds = await contracts.hysiBatchInteraction.getAccountBatches(
          depositor.address
        );
        const batches = await Promise.all(
          batchIds.map((id) => contracts.hysiBatchInteraction.batches(id))
        );

        await expect(
          contracts.hysiBatchInteraction.moveUnclaimedDepositsIntoCurrentBatch(
            [batches[0].batchId],
            [parseEther("10000")],
            batches[0].batchType
          )
        ).to.be.revertedWith("has not yet been processed");
      });
      it("reverts when a user tries to transfer more funds than they have", async function () {
        await contracts.threeCrv
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("10000"));
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForMint(parseEther("10000"), depositor.address);
        await contracts.hysiBatchInteraction.batchMint(0);
        const batchId = await contracts.hysiBatchInteraction.getAccountBatches(
          depositor.address
        );
        await expect(
          contracts.hysiBatchInteraction.moveUnclaimedDepositsIntoCurrentBatch(
            [batchId[0]],
            [parseEther("20000")],
            BatchType.Mint
          )
        ).to.be.revertedWith("insufficient funds");
      });
    });
    context("success", function () {
      it("moves minted hysi into current redeemBatch", async function () {
        this.timeout(60000);
        await contracts.threeCrv
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("10000"));
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForMint(parseEther("10000"), depositor.address);
        const batchId = await contracts.hysiBatchInteraction.getAccountBatches(
          depositor.address
        );
        await provider.send("evm_increaseTime", [2500]);
        await provider.send("evm_mine", []);
        await contracts.hysiBatchInteraction.connect(owner).batchMint(0);
        const mintedHYSI = await contracts.hysi.balanceOf(
          contracts.hysiBatchInteraction.address
        );
        expect(
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .moveUnclaimedDepositsIntoCurrentBatch(
              [batchId[0]],
              [parseEther("10000")],
              BatchType.Mint
            )
        )
          .to.emit(
            contracts.hysiBatchInteraction,
            "MovedUnclaimedDepositsIntoCurrentBatch"
          )
          .withArgs(mintedHYSI, BatchType.Mint, depositor.address);
        const currentRedeemBatchId =
          await contracts.hysiBatchInteraction.currentRedeemBatchId();
        const redeemBatch = await contracts.hysiBatchInteraction.batches(
          currentRedeemBatchId
        );
        expect(redeemBatch.suppliedTokenBalance).to.be.equal(mintedHYSI);
      });
      it("moves 3crv redeemed from HYSI into current mintBatch", async function () {
        await distributeHysiToken();
        const hysiBalance = await contracts.hysi.balanceOf(depositor.address);
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForRedeem(hysiBalance);
        const batchId = await contracts.hysiBatchInteraction.getAccountBatches(
          depositor.address
        );
        await provider.send("evm_increaseTime", [2500]);
        await provider.send("evm_mine", []);
        await contracts.hysiBatchInteraction.connect(owner).batchRedeem(0);
        const redeemed3CRV = (
          await contracts.hysiBatchInteraction.batches(batchId[1])
        ).claimableTokenBalance;
        expect(
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .moveUnclaimedDepositsIntoCurrentBatch(
              [batchId[1]],
              [hysiBalance],
              BatchType.Redeem
            )
        )
          .to.emit(
            contracts.hysiBatchInteraction,
            "MovedUnclaimedDepositsIntoCurrentBatch"
          )
          .withArgs(redeemed3CRV, BatchType.Redeem, depositor.address);
        const currentMintBatchId =
          await contracts.hysiBatchInteraction.currentMintBatchId();
        const redeemBatch = await contracts.hysiBatchInteraction.batches(
          currentMintBatchId
        );
        expect(redeemBatch.suppliedTokenBalance).to.be.equal(redeemed3CRV);
      });
      it("moves only parts of the funds in a batch", async function () {
        await contracts.threeCrv
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("10000"));
        await contracts.hysiBatchInteraction
          .connect(depositor)
          .depositForMint(parseEther("10000"), depositor.address);
        const [batchId] =
          await contracts.hysiBatchInteraction.getAccountBatches(
            depositor.address
          );
        await provider.send("evm_increaseTime", [2500]);
        await provider.send("evm_mine", []);
        await contracts.hysiBatchInteraction.connect(owner).batchMint(0);
        const mintedHYSI = await contracts.hysi.balanceOf(
          contracts.hysiBatchInteraction.address
        );
        expect(
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .moveUnclaimedDepositsIntoCurrentBatch(
              [batchId],
              [parseEther("5000")],
              BatchType.Mint
            )
        )
          .to.emit(
            contracts.hysiBatchInteraction,
            "MovedUnclaimedDepositsIntoCurrentBatch"
          )
          .withArgs(mintedHYSI.div(2), BatchType.Mint, depositor.address);
        //can be between 20326591836734693877 and 20326591836734693876
        const currentRedeemBatchId =
          await contracts.hysiBatchInteraction.currentRedeemBatchId();
        const redeemBatch = await contracts.hysiBatchInteraction.batches(
          currentRedeemBatchId
        );
        expect(redeemBatch.suppliedTokenBalance.toString()).to.include(
          mintedHYSI.div(2).toString().slice(0, -1) // losing 1 wei of precision because of division rounding
        );
        const mintBatch = await contracts.hysiBatchInteraction.batches(batchId);
        expect(mintBatch.claimableTokenBalance.toString()).to.include(
          mintedHYSI.div(2).toString().slice(0, -1)
        );
      });
      it("moves funds from up to 20 batches", async function () {
        this.timeout(60000);

        await contracts.threeCrv
          .connect(depositor)
          .approve(contracts.hysiBatchInteraction.address, parseEther("2000"));
        await bluebird.map(
          new Array(20).fill(0),
          async (i) => {
            await contracts.hysiBatchInteraction
              .connect(depositor)
              .depositForMint(parseEther("100"), depositor.address);
            await provider.send("evm_increaseTime", [2500]);
            await provider.send("evm_mine", []);
            await contracts.hysiBatchInteraction.connect(owner).batchMint(0);
          },
          { concurrency: 1 }
        );
        const batchIds = await contracts.hysiBatchInteraction.getAccountBatches(
          depositor.address
        );
        const mintedHYSI = await contracts.hysi.balanceOf(
          contracts.hysiBatchInteraction.address
        );
        expect(
          await contracts.hysiBatchInteraction
            .connect(depositor)
            .moveUnclaimedDepositsIntoCurrentBatch(
              batchIds,
              new Array(20).fill(parseEther("100")),
              BatchType.Mint
            )
        )
          .to.emit(
            contracts.hysiBatchInteraction,
            "MovedUnclaimedDepositsIntoCurrentBatch"
          )
          .withArgs(mintedHYSI, BatchType.Mint, depositor.address);
        const currentRedeemBatchId =
          await contracts.hysiBatchInteraction.currentRedeemBatchId();
        const redeemBatch = await contracts.hysiBatchInteraction.batches(
          currentRedeemBatchId
        );
        expect(redeemBatch.suppliedTokenBalance).to.be.equal(mintedHYSI);
      });
    });
  });
});
