package com.hacker1717.acetrackmobile.suggested;

import com.wix.detox.Detox;
import com.wix.detox.config.DetoxConfig;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.LargeTest;
import androidx.test.rule.ActivityTestRule;

@RunWith(AndroidJUnit4.class)
@LargeTest
public class DetoxTest {
    @Rule
    public ActivityTestRule<MainActivity> mActivityRule = new ActivityTestRule<>(MainActivity.class, false, false);

    @Test
    public void runDetoxTests() {
        DetoxConfig detoxConfig = new DetoxConfig();
        detoxConfig.idlePolicyConfig.masterTimeoutSec = 120;
        detoxConfig.idlePolicyConfig.idleResourceTimeoutSec = 120;
        detoxConfig.rnContextLoadTimeoutSec = (com.hacker1717.acetrackmobile.suggested.BuildConfig.DEBUG ? 120 : 60);

        Detox.runTests(mActivityRule, detoxConfig);
    }
}
