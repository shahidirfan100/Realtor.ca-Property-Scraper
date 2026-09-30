# Specify the base Docker image. You can read more about
# the available images at https://crawlee.dev/docs/guides/docker-images
# You can also use any other image from Docker Hub.
# The image ships the Chromium build used by the stealth browser session.
FROM apify/actor-node-playwright-chrome:24-1.63.0

# Check that the image provides the Chrome binary used by the stealth browser session.
RUN google-chrome --version

# Copy just package.json and package-lock.json
# to speed up the build using Docker layer cache.
COPY --chown=myuser:myuser package*.json Dockerfile ./

# Install NPM packages. The base image ships its own node_modules, which is
# removed first so npm builds a dependency tree that matches this Actor.
# impit publishes its native binary as an optional platform dependency, so
# optional dependencies must not be omitted here.
RUN rm -rf node_modules \
    && npm --quiet set progress=false \
    && npm install --omit=dev --no-audit --no-fund \
    && node -e "import('impit').then(m => console.log('impit OK:', Object.keys(m)))" \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version \
    && rm -r ~/.npm

# Next, copy the remaining files and directories with the source code.
# Since we do this after NPM install, quick build will be really fast
# for most source file changes.
COPY --chown=myuser:myuser . ./

CMD npm start --silent
