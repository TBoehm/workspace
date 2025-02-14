import { Web3Provider } from '@ethersproject/providers';
import { BeneficiaryApplication } from '@popcorn/contracts/adapters';
import {
  formatAndRoundBigNumber,
  getBytes32FromIpfsHash,
  IpfsClient,
} from '@popcorn/utils';
import { useWeb3React } from '@web3-react/core';
import BeneficiaryPage from 'components/Beneficiaries/BeneficiaryPage';
import { setSingleActionModal } from 'context/actions';
import { store } from 'context/store';
import { connectors } from 'context/Web3/connectors';
import { ContractsContext } from 'context/Web3/contracts';
import { BigNumber } from 'ethers';
import { useRouter } from 'next/router';
import { defaultFormData, FormStepProps } from 'pages/proposals/propose';
import React, { useContext, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { DisplayIncompleteFormInputs } from './DisplayIncompleteFormInputs';

const success = () => toast.success('Successful upload to IPFS');
const loading = () => toast.loading('Uploading to IPFS...');
const uploadError = (errMsg: string) => toast.error(errMsg);

const Preview: React.FC<FormStepProps> = ({ form, navigation, visible }) => {
  const context = useWeb3React<Web3Provider>();

  const { dispatch } = useContext(store);
  const { contracts } = useContext(ContractsContext);
  const { library, account, activate, active } = context;
  const router = useRouter();
  const [formData, setFormData] = form;
  const { currentStep, setCurrentStep } = navigation;
  const [proposalBond, setProposalBond] = useState<BigNumber>();

  useEffect(() => {
    if (contracts) {
      getProposalBond().then((proposalBond) => setProposalBond(proposalBond));
    }
  }, [contracts]);

  async function checkPreConditions(): Promise<boolean> {
    if (!contracts) {
      return false;
    }
    if (!account) {
      dispatch(
        setSingleActionModal({
          content: 'Connect your wallet to continue',
          title: 'Connect your Wallet',
          visible: true,
          type: 'error',
          onConfirm: {
            label: 'Connect',
            onClick: () => {
              activate(connectors.Injected);
              dispatch(setSingleActionModal(false));
            },
          },
        }),
      );
      return false;
    }
    const balance = await contracts.pop.balanceOf(account);
    if (proposalBond.gt(balance)) {
      dispatch(
        setSingleActionModal({
          content: `In order to create a proposal you need to post a Bond of ${formatAndRoundBigNumber(
            proposalBond,
          )} POP`,
          title: 'You need more POP',
          visible: true,
          type: 'error',
          onConfirm: {
            label: 'Close',
            onClick: () => {
              dispatch(setSingleActionModal(false));
            },
          },
        }),
      );
      return false;
    }
    return true;
  }

  const getListOfIncompleteFormInputs = (
    submissionData: BeneficiaryApplication,
  ): string[] => {
    let incompleteFormInputs = [];
    if (submissionData.organizationName === '')
      incompleteFormInputs.push('Organization Name');
    if (submissionData.missionStatement === '')
      incompleteFormInputs.push('Mission Statement');
    if (submissionData.beneficiaryAddress === '')
      incompleteFormInputs.push('Beneficiary Address');
    if (submissionData.files.profileImage.image === '')
      incompleteFormInputs.push('Profile Image');
    if (submissionData.files.profileImage.description === '')
      incompleteFormInputs.push('Profile Image Description');
    if (submissionData.files.headerImage.image === '')
      incompleteFormInputs.push('Header Image');
    if (submissionData.files.headerImage.description === '')
      incompleteFormInputs.push('Header Image Description');
    if (submissionData.files.impactReports.length === 0)
      incompleteFormInputs.push('Impact Reports');
    if (submissionData.files.video === '') incompleteFormInputs.push('Video');
    if (submissionData.links.website === '')
      incompleteFormInputs.push('Website');
    if (submissionData.links.contactEmail === '')
      incompleteFormInputs.push('Contact Email');
    return incompleteFormInputs;
  };

  async function uploadJsonToIpfs(
    submissionData: BeneficiaryApplication,
  ): Promise<void> {
    if (await checkPreConditions()) {
      console.log('precondition success');
      loading();
      const cid = await IpfsClient.add(submissionData);
      toast.dismiss();
      await (
        await contracts.pop
          .connect(library.getSigner())
          .approve(contracts.beneficiaryGovernance.address, proposalBond)
      ).wait();
      //TODO swap out default region with dynamic logic for the region
      await contracts.beneficiaryGovernance
        .connect(library.getSigner())
        .createProposal(
          submissionData.beneficiaryAddress,
          '0x5757',
          getBytes32FromIpfsHash(cid),
          0,
        );

      success();
      setTimeout(() => router.push(`/beneficiary-proposals/${account}`), 1000);
      clearLocalStorage();
    }
  }

  function clearLocalStorage() {
    setCurrentStep(1);
    setFormData(defaultFormData);
  }

  async function getProposalBond(): Promise<BigNumber> {
    const proposalDefaultConfigurations =
      await contracts.beneficiaryGovernance.DefaultConfigurations();
    return proposalDefaultConfigurations.proposalBond;
  }

  return (
    visible && (
      <div>
        <div className="md:flex md:items-center md:justify-between my-8 mx-4">
          <div className="min-w-0 ">
            <h2 className="text-xl font-bold text-gray-900 sm:text-xl sm:truncate">
              Beneficiary Nomination Proposal Preview
            </h2>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4">
            <button
              type="button"
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              onClick={() => {
                setCurrentStep(currentStep - 1);
              }}
            >
              Back/Edit
            </button>
            {getListOfIncompleteFormInputs(formData).length == 0 && (
              <button
                type="button"
                className="ml-3 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                onClick={() => {
                  uploadJsonToIpfs(formData);
                }}
              >
                Submit
              </button>
            )}
          </div>
        </div>
        {getListOfIncompleteFormInputs(formData).length > 0 && (
          <DisplayIncompleteFormInputs
            incompleteFields={getListOfIncompleteFormInputs(formData)}
          />
        )}
        <BeneficiaryPage beneficiary={formData} isProposalPreview />
      </div>
    )
  );
};
export default Preview;
