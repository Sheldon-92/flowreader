#!/usr/bin/env node

// Quick test script to verify upload API with authentication bypass
async function testUpload() {
    const testData = {
        fileName: 'test-book.epub',
        fileSize: 1024,
        fileData: 'dGVzdCBkYXRhIGZvciBib29r', // base64 for "test data for book"
        userId: 'test-user-123'
    };

    try {
        console.log('Testing upload API at http://localhost:5173/api/books/upload');
        console.log('Sending data:', {
            fileName: testData.fileName,
            fileSize: testData.fileSize,
            userId: testData.userId,
            fileDataLength: testData.fileData.length
        });

        const response = await fetch('http://localhost:5173/api/books/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testData)
        });

        const result = await response.json();

        if (response.ok) {
            console.log('✅ Upload successful!');
            console.log('Result:', JSON.stringify(result, null, 2));
        } else {
            console.log('❌ Upload failed');
            console.log('Status:', response.status);
            console.log('Error:', result);
        }
    } catch (error) {
        console.error('❌ Request failed:', error.message);
    }
}

testUpload();