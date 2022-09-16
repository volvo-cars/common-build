rm -rf frontend/src/domain-model
cp -r backend/src/domain-model frontend/src
rm frontend/src/domain-model/default-xml-extractor.ts # TODO: Separate Agent- and Frontend dependencies