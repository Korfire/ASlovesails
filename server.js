// backend/server.js - CLOUDINARY VERSION (FREE & SIMPLE!)
const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const cors = require('cors'); 
const archiver = require('archiver'); // For zipping files for Download All
const path = require('path');
const app = express();

// --- FIX 1: Ensure 'uploads' directory exists ---
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

const upload = multer({ dest: uploadDir });

// Allow your frontend (running on port 3000) to access this backend
app.use(cors({
  origin: 'https://aslovesails2026.netlify.app'
})); 
app.use(express.json());
app.get('/', (req, res) => {
  res.send('Wedding Server is Up and Running! 🥂');
});

// CLOUDINARY CONFIGURATION
// Sign up at https://cloudinary.com (FREE - 25GB storage, 25GB bandwidth/month)
// Get your credentials from dashboard
cloudinary.config({
  cloud_name: 'dkz0e85l0',  // CHANGE THIS
  api_key: '266163525195617',        // CHANGE THIS
  api_secret: 'Pckd87KPJqDV2fucbwALT5Ujs90'   // CHANGE THIS
});

// In-memory photo database (for demo - use real DB in production)
let photosDB = [];

// --- ENDPOINT: FETCH ALL PHOTOS AND VIDEOS ---
app.get('/photos', async (req, res) => {
  try {
    // Fetch all media from Cloudinary with tag 'wedding-album'
    const result = await cloudinary.api.resources_by_tag('wedding-album', {
      max_results: 500,
      context: true, // Get custom context (guest name)
      resource_type: 'auto' // Get both images and videos
    });

    // Map Cloudinary resources to our format
    const photos = result.resources.map(resource => {
      const guestName = resource.context?.custom?.guestName || 'Guest';
      
      return {
        id: resource.public_id,
        url: resource.secure_url,
        guestName: guestName,
        uploadedAt: resource.created_at,
        isVideo: resource.resource_type === 'video' // Identify videos
      };
    });

    // Sort by newest first
    photos.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    
    res.json(photos);
  } catch (error) {
    console.error("Error fetching gallery:", error);
    res.status(500).json({ error: "Could not load gallery", details: error.message });
  }
});

// --- ENDPOINT: UPLOAD PHOTO OR VIDEO ---
app.post('/upload', upload.single('photo'), async (req, res) => {
  console.log("Received upload request...");
  console.log("File details:", req.file);
  const guestName = req.body.guestName || "Anonymous";
  const filePath = req.file.path;
  
  try {
    // Determine if file is a video based on mimetype
    const isVideo = req.file.mimetype.startsWith('video/');
    console.log(`File type detected: ${isVideo ? 'video' : 'image'} (mimetype: ${req.file.mimetype})`);
    
    // Upload to Cloudinary with auto resource type detection
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'wedding-album', // Organize in folder
      tags: ['wedding-album'], // Tag for easy retrieval
      context: `guestName=${guestName}`, // Store guest name as metadata
      resource_type: 'auto' // Let Cloudinary auto-detect the type
    });

    console.log(`Success! Uploaded to Cloudinary: ${result.public_id}`);
    
    // Cleanup local file
    fs.unlinkSync(filePath);
    
    res.status(200).json({ 
      success: true, 
      fileId: result.public_id,
      url: result.secure_url,
      isVideo: result.resource_type === 'video'
    });

  } catch (error) {
    console.error("Error uploading:", error);
    console.error("Full error details:", JSON.stringify(error, null, 2));
    // Cleanup local file even on error
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.status(500).json({ error: "Upload failed", details: error.message });
  }
});

// --- ENDPOINT: DELETE PHOTO OR VIDEO (Admin) ---
app.delete('/photos/:id', async (req, res) => {
  try {
    // FIX: Decode the URL-encoded photo ID
    const publicId = decodeURIComponent(req.params.id);
    
    console.log("Attempting to delete media with ID:", publicId);
    
    // Try deleting as image first, then as video if that fails
    let result = await cloudinary.uploader.destroy(publicId);
    
    if (result.result === 'not found') {
      // If not found as image, try as video
      result = await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
    }
    
    console.log("Cloudinary delete result:", result);
    
    if (result.result === 'ok' || result.result === 'not found') {
      res.status(200).json({ success: true, message: "Deleted successfully" });
    } else {
      res.status(500).json({ error: "Delete failed", details: result });
    }
  } catch (error) {
    console.error("Error deleting file:", error);
    res.status(500).json({ error: "Delete failed", details: error.message });
  }
});

// --- ENDPOINT: DOWNLOAD ALL AS ZIP (Admin) ---
app.get('/download-all', async (req, res) => {
  try {
    // Fetch all photos and videos
    const result = await cloudinary.api.resources_by_tag('wedding-album', {
      max_results: 500,
      resource_type: 'auto' // Get both images and videos
    });

    if (result.resources.length === 0) {
      return res.status(404).send("No media to download");
    }

    // Set headers for zip download
    res.attachment('wedding-gallery.zip');
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    // Download each file and add to zip
    const https = require('https');
    const downloadPromises = result.resources.map((resource, index) => {
      return new Promise((resolve, reject) => {
        https.get(resource.secure_url, (stream) => {
          // Determine file extension based on resource type
          const isVideo = resource.resource_type === 'video';
          const ext = isVideo ? '.mp4' : '.jpg';
          const fileName = `${isVideo ? 'video' : 'photo'}_${index + 1}${ext}`;
          
          archive.append(stream, { name: fileName });
          stream.on('end', resolve);
          stream.on('error', reject);
        }).on('error', reject);
      });
    });

    // Wait for all downloads to complete
    await Promise.all(downloadPromises);
    
    archive.finalize();
  } catch (error) {
    console.error("Download Error:", error);
    res.status(500).send("Error creating zip");
  }
});

// Start Server on Port 5000
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Backend Server Running on ${PORT}`));