import mongoose from 'mongoose';
mongoose.connect('mongodb+srv://shashankshekhar0517:hackerisback1717@cluster0.10s3q.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0')
  .then(async () => {
    const Player = mongoose.model('Player', new mongoose.Schema({}, { strict: false }));
    const SystemLog = mongoose.model('SystemLog', new mongoose.Schema({}, { strict: false }));
    
    console.log("Looking for shush...");
    const p1 = await Player.findOne({ id: /shush/i });
    console.log("Player shush:", p1);

    const p2 = await Player.findOne({ id: /shashankshekhar/i });
    console.log("Player shashank:", p2);

    process.exit(0);
  });
