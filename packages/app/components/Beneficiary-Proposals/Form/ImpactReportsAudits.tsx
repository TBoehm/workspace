import React from 'react';
import IpfsUpload from './IpfsUpload';
import { FormStepProps } from './ProposalForm';

export default function ImpactReportsAudits({
  form,
  navigation,
  visible,
}: FormStepProps): JSX.Element {
  const [formData, setFormData] = form;
  function updateImpactReports(impactReports) {
    setFormData({ ...formData, impactReports });
  }
  return (
    visible && (
      <IpfsUpload
        stepName={'8 - Upload Impact Reports'}
        localState={formData.impactReports}
        setLocalState={updateImpactReports}
        imageDescription={'Impact Reports'}
        imageInstructions={
          'Impact report uploads are limited to up to a maximum of four PDFs, each with a maximum size of 5mb.'
        }
        fileType={'.pdf'}
        numMaxFiles={4}
        navigation={navigation}
      />
    )
  );
}
