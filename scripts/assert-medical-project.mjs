const target = process.env.GCLOUD_PROJECT;
const approved = process.env.MEDICAL_DEPLOY_PROJECT;
const source = process.env.MYNEKABA_PROJECT_ID;
if (
  !target ||
  !approved ||
  !source ||
  target !== approved ||
  target === source
) {
  console.error(
    "Deployment blocked: explicitly set MEDICAL_DEPLOY_PROJECT and MYNEKABA_PROJECT_ID; target must equal Medical and differ from MyNekaba.",
  );
  process.exit(1);
}
console.log(
  "Medical deployment target verified; membership source is excluded.",
);
