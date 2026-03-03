const TermsPage = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <h1 className="text-3xl font-bold">Terms &amp; Conditions</h1>
        <p className="text-sm text-muted-foreground">
          Last updated: {new Date().toLocaleDateString()}
        </p>

        <section className="space-y-3 text-sm leading-relaxed">
          <p>
            By using this application, you agree that we may process your uploaded
            documents and store authentication data required to provide the
            service. Your data is used only to power features like PDF
            processing, search, and chat.
          </p>
          <p>
            Authentication is handled via Supabase. When you accept cookies, we
            store a JSON Web Token (JWT) in a cookie to keep you signed in
            securely. You can revoke this at any time by signing out.
          </p>
          <p>
            Do not upload content that you are not authorized to share. You are
            responsible for ensuring that your use of this application complies
            with applicable laws and any agreements you have with third parties.
          </p>
          <p>
            This page is a simple terms overview for this demo. For production
            use, you should replace this text with your own legal terms and a
            full privacy policy.
          </p>
        </section>
      </div>
    </div>
  );
};

export default TermsPage;

