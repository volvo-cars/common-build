devProfile=$1
if [ "$devProfile" ]; then
echo Starting with $devProfile.
CB_DEV=$devProfile SYSTEM_ID=$devProfile npm run start:dev | npx pino-pretty
else
    echo Start with: ./start-dev.sh SystemID
    exit 1
fi