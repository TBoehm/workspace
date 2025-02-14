import { CheckIcon } from '@heroicons/react/outline';
import { Navigation } from 'pages/proposals/propose';

export interface ContinueButtonProps {
  navigation: Navigation;
}
export const ContinueButton: React.FC<ContinueButtonProps> = ({
  navigation,
}) => {
  const { currentStep, setCurrentStep } = navigation;
  return (
    <div className="grid justify-items-stretch">
      <button
        onClick={() => {
          setCurrentStep(currentStep + 1);
        }}
        className="justify-self-center mt-4 inline-flex px-4 py-2 border border-transparent text-sm font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
      >
        OK
        <CheckIcon className="ml-2 -mr-1 h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
};
export default ContinueButton;
