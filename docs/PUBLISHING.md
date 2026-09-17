# Source repository and deployment

The source repository is [ashishjuley10/trackmymetric](https://github.com/ashishjuley10/trackmymetric). It contains a cleaned snapshot of the working application, with the original deployment identity, personal default targets and private return URL removed. User records are stored separately and are not part of this repository.

## Updating the source

```bash
git clone https://github.com/ashishjuley10/trackmymetric.git
cd trackmymetric
git switch -c describe-your-change
```

Follow [SETUP.md](SETUP.md), make the change and run the documented checks. Review the staged files, commit on the feature branch and open a pull request. The validation workflow runs on pull requests and changes to `main`.

Use the normal GitHub credential flow; do not write an access token into source. Inspect the remote before updating an existing branch, and do not force-push over other work.

## Deployment is separate

Uploading code does not publish a website, activate the ChatGPT connection, import production records or create an iOS binary. The original private Site is a separate deployment with its own authentication and database bindings. The GitHub workflow only validates source.

For a new deployment, provision the required hosting resources and authentication boundary described in [SETUP.md](SETUP.md). Never copy a deployment's private credentials or user database into a pull request.
