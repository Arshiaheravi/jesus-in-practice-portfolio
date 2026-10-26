import { supportEmail } from "@/lib/operator";

export default function OperatorDetails() {
  const name = process.env.OPERATOR_NAME;
  const address = process.env.OPERATOR_MAILING_ADDRESS;
  return (
    <section className="prose" aria-label="Service operator">
      <h2>Contact the operator</h2>
      {name && address ? (
        <p>
          {name}
          <br />
          {address}
          <br />
          {supportEmail && <a href={`mailto:${supportEmail}`}>{supportEmail}</a>}
        </p>
      ) : (
        <p>
          {supportEmail ? (
            <>
              Support: <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. The legal operator and
              mailing address must be confirmed before the service launches.
            </>
          ) : (
            "This local demonstration has no service operator or support mailbox. Operator contact details must be supplied before a public service launches."
          )}
        </p>
      )}
    </section>
  );
}
