FROM node:24-bookworm-slim AS node-runtime

FROM eclipse-temurin:21-jre-jammy

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
  && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
  && npm install --global --allow-scripts=protobufjs,re2 firebase-tools

WORKDIR /workspace
COPY firebase.json .firebaserc firestore.rules firestore.indexes.json ./

EXPOSE 4000 8080 9099
CMD ["firebase", "emulators:start", "--only", "auth,firestore"]
