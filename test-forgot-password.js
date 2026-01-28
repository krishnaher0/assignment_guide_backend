/**
 * Test Script for Forgot Password Functionality
 *
 * This script tests the forgot password flow:
 * 1. Request password reset for a test user
 * 2. Verify email is sent
 * 3. Test rate limiting
 */

import axios from 'axios';

const API_URL = 'http://localhost:5001/api';
const TEST_EMAIL = 'sabin@gmail.com';

async function testForgotPassword() {
    console.log('🧪 Testing Forgot Password Functionality\n');

    try {
        // Test 1: Valid email
        console.log('Test 1: Request password reset for valid email');
        const response = await axios.post(`${API_URL}/auth/forgot-password`, {
            email: TEST_EMAIL
        });
        console.log('✅ Response:', response.data);
        console.log('   Status:', response.status, '\n');

        // Test 2: Non-existent email (should still return success to prevent enumeration)
        console.log('Test 2: Request password reset for non-existent email');
        const response2 = await axios.post(`${API_URL}/auth/forgot-password`, {
            email: 'nonexistent@example.com'
        });
        console.log('✅ Response:', response2.data);
        console.log('   Status:', response2.status, '\n');

        // Test 3: Missing email field
        console.log('Test 3: Request with missing email');
        try {
            await axios.post(`${API_URL}/auth/forgot-password`, {});
        } catch (err) {
            console.log('✅ Expected error:', err.response?.data?.message || err.message);
            console.log('   Status:', err.response?.status, '\n');
        }

        // Test 4: Rate limiting (try 4 requests quickly)
        console.log('Test 4: Testing rate limiting (max 3 per hour)');
        for (let i = 1; i <= 4; i++) {
            try {
                const res = await axios.post(`${API_URL}/auth/forgot-password`, {
                    email: 'test@example.com'
                });
                console.log(`   Request ${i}: ✅ Success`);
            } catch (err) {
                if (err.response?.status === 429) {
                    console.log(`   Request ${i}: ✅ Rate limited (expected) - ${err.response?.data?.message}`);
                } else {
                    console.log(`   Request ${i}: ❌ Unexpected error - ${err.message}`);
                }
            }
            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log('\n🎉 All tests completed!');
        console.log('\n📧 Check the email inbox for:', TEST_EMAIL);
        console.log('   The email should contain a password reset link.');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', error.response.data);
        }
    }
}

// Run tests
testForgotPassword();
