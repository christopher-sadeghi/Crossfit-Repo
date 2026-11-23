export const WAIVER_TEMPLATE = `Assumption of Risk, Release of Liability and Consent

Please read carefully before signing.

1. Voluntary participation. I am voluntarily taking part in coaching, training, workouts and related activities with {{coach_name}} ("my coach"), whether in person, remotely or through the FitCoach app.

2. Risks. I understand that strength and conditioning training, including CrossFit-style workouts, Olympic lifting, gymnastics, running, rowing, jumping and high-intensity exercise, carries risks. These include muscle strains and sprains, joint, back and bone injuries, heart attack, stroke, fainting and, in rare cases, death. I accept these risks.

3. Health. I confirm that I am physically able to take part. I have answered the health questions honestly. I will tell my coach promptly about any injury, illness, pregnancy, medication change or other change in my health. I have been advised to see a doctor before starting a new exercise program, and I take responsibility for doing so.

4. Listening to my body. I will train within my limits, use proper form and equipment, and stop and tell my coach if I feel pain, dizziness, chest discomfort or shortness of breath. Workouts, scaling and nutrition guidance, including suggestions created with the help of AI, are general fitness guidance and not medical advice.

5. Release. To the fullest extent allowed by law, I release and agree not to sue my coach, and anyone working with my coach, for any injury, loss or damage arising from my participation, except where caused by gross negligence or willful misconduct.

6. Medical treatment. If I am injured or become ill while training, I authorize my coach to call emergency services and to contact my emergency contact.

7. Photos and video. Any photos or videos I upload, such as form-check videos and progress photos, are shared only with my coach for coaching purposes.

8. Agreement. I have read this waiver, I understand it, and I am signing it voluntarily. If any part is found unenforceable, the rest remains in effect.
`;

export type WaiverVersionSummary = { id: string; version: number };
export type WaiverSignatureSummary = {
  signedAt: string;
  signedName: string;
  version: number;
  waiverId?: string;
};

export type WaiverStatus =
  | { status: "needs_sign"; latestWaiver: WaiverVersionSummary }
  | { status: "signed"; signature: WaiverSignatureSummary }
  | { status: "not_requested" };

export function waiverStatus({
  waiverRequestedAt,
  latestWaiver,
  signatures,
}: {
  waiverRequestedAt: string | null | undefined;
  latestWaiver: WaiverVersionSummary | null | undefined;
  signatures: WaiverSignatureSummary[];
}): WaiverStatus {
  const latestSignature = [...signatures].sort(
    (a, b) => Date.parse(b.signedAt) - Date.parse(a.signedAt),
  )[0];
  const signedAfterRequest = waiverRequestedAt
    ? signatures.some((signature) => Date.parse(signature.signedAt) >= Date.parse(waiverRequestedAt))
    : false;

  if (waiverRequestedAt && latestWaiver && !signedAfterRequest) {
    return { status: "needs_sign", latestWaiver };
  }
  if (latestSignature) return { status: "signed", signature: latestSignature };
  return { status: "not_requested" };
}

export function renderWaiverBody(body: string, coachName: string): string {
  return body.replaceAll("{{coach_name}}", coachName.trim() || "your coach");
}
