FROM apify/actor-node-playwright-firefox:24-1.59.1

COPY --chown=myuser:myuser package*.json ./
RUN npm --quiet set progress=false \
    && npm install --omit=dev --include=optional \
    && node -e "import('impit').then(m => console.log('impit OK:', Object.keys(m)))" \
    && rm -rf ~/.npm

COPY --chown=myuser:myuser . ./

ENV APIFY_LOG_LEVEL=INFO

CMD npm start --silent
