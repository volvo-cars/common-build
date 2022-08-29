devProfile=$1
echo $devProfile
if [ "$devProfile" ]; then
echo Starting with $devProfile.
CB_DEV=$devProfile npm run start:dev | npx pino-pretty
else
echo Starting without devProfile.
npm run start:dev | npx pino-pretty
fi