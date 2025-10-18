// Script to drop the problematic text index
// Run this in MongoDB shell or MongoDB Compass

// Connect to your database
use segmentator; // or whatever your database name is

// Drop the text index on transcription collection
db.transcriptions.dropIndex({ "fullText": "text", "segments.text": "text" });

// Verify indexes
db.transcriptions.getIndexes();
