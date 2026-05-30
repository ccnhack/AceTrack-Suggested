/**
 * Video Analysis Service (Simulation)
 * Simulates AI processing of a video to identify highlights.
 */

export async function processVideoHighlights(videoId, videoUrl) {
  // Simulate processing delay (2-4 seconds)
  await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));

  // In a real scenario, this would send the video URL to a vision API
  // and return actual timestamps of intense rallies.
  
  // For simulation, we generate 3 random highlights.
  // Assuming a typical 10-15 min video, let's pick random start times in seconds.
  
  const generateRandomClip = (index) => {
    // Generate a start time between 30s and 300s
    const startTime = Math.floor(Math.random() * 270) + 30;
    const duration = Math.floor(Math.random() * 5) + 8; // 8-12 seconds
    
    const descriptions = [
      "Incredible backhand winner down the line.",
      "Intense 15-shot rally.",
      "Perfect drop shot finish.",
      "Aces the serve on game point.",
      "Great defensive lob and recovery."
    ];
    
    return {
      id: `clip-${videoId}-${index}`,
      startTime: startTime,
      endTime: startTime + duration,
      description: descriptions[Math.floor(Math.random() * descriptions.length)],
      thumbnailUrl: null // Could use Cloudinary transformation to grab a frame
    };
  };

  return [
    generateRandomClip(1),
    generateRandomClip(2),
    generateRandomClip(3)
  ].sort((a, b) => a.startTime - b.startTime);
}
