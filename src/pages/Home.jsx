/**
 * Home.jsx - Home Page
 *
 * The landing page for LineageWeaver, featuring an animated hero,
 * statistics dashboard, quick actions, recent activity, and navigation
 * to the major systems (Family Tree, Codex, Armory, Dignities,
 * Writing Studio, Data Forge).
 */

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import Navigation from '../components/Navigation';
import { useGenealogy } from '../contexts/GenealogyContext';
import { getEntriesCount } from '../services/codexService';
import { getHeraldryCount } from '../services/heraldryService';

// Import home page components
import {
  HeroSection,
  StatsGlance,
  QuickActions,
  RecentActivity,
  SystemCard
} from '../components/home';

import './Home.css';

/**
 * Home Page Component
 */
export default function Home() {
  // ==================== STATE ====================

  // All features enabled by default
  const features = {
    heroAnimations: true,
    statsGlance: true,
    particleBackground: false,
    recentActivity: true,
    quickActions: true,
    cardAnimations: true,
    countUpAnimation: true,
    staggeredEntrance: true,
    decorativeFlourishes: true,
  };

  // Additional data not in GenealogyContext (counts only for performance)
  const [codexEntriesCount, setCodexEntriesCount] = useState(0);
  const [heraldryCount, setHeraldryCount] = useState(0);
  const [isLoadingExtra, setIsLoadingExtra] = useState(true);

  // Get core data from context
  const { people, houses, relationships, loading: coreLoading } = useGenealogy();

  // ==================== DATA LOADING ====================

  // Load codex and heraldry COUNTS only (not full data) for performance
  // This avoids loading potentially thousands of records just for displaying counts
  useEffect(() => {
    let cancelled = false;

    async function loadExtraCounts() {
      try {
        setIsLoadingExtra(true);

        // Use count functions instead of loading all data
        const [entriesCount, heraldryCountResult] = await Promise.all([
          getEntriesCount(),
          getHeraldryCount()
        ]);

        // Only update state if component is still mounted
        if (!cancelled) {
          setCodexEntriesCount(entriesCount || 0);
          setHeraldryCount(heraldryCountResult || 0);
        }
      } catch (error) {
        if (!cancelled && import.meta.env.DEV) {
          console.error('Error loading extra counts for home page:', error);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingExtra(false);
        }
      }
    }

    loadExtraCounts();

    // Cleanup function to prevent state updates on unmounted component
    return () => { cancelled = true; };
  }, []);
  
  // ==================== COMPUTED VALUES ====================

  // Statistics for the dashboard
  const stats = useMemo(() => ({
    people: people.length,
    houses: houses.length,
    relationships: relationships.length,
    codexEntries: codexEntriesCount,
    heraldry: heraldryCount
  }), [people.length, houses.length, relationships.length, codexEntriesCount, heraldryCount]);

  // Whether user has any data at all
  const hasData = stats.people > 0 || stats.houses > 0;

  // Loading state
  const isLoading = coreLoading || isLoadingExtra;
  
  // ==================== SYSTEM CARDS CONFIG ====================
  
  const systemCards = [
    {
      iconName: 'tree-deciduous',
      title: 'Family Tree',
      subtitle: 'Browse houses and explore interactive genealogy trees',
      path: '/tree',
      accentColor: 'accent-tree',
      delay: 0
    },
    {
      iconName: 'book-open',
      title: 'The Codex',
      subtitle: 'Wiki-style encyclopedia for your world\'s lore',
      path: '/codex',
      accentColor: 'accent-codex',
      delay: 0.05
    },
    {
      iconName: 'shield',
      title: 'The Armory',
      subtitle: 'Design heraldic arms and coats of arms',
      path: '/heraldry',
      accentColor: 'accent-armory',
      delay: 0.1
    },
    {
      iconName: 'crown',
      title: 'Dignities',
      subtitle: 'Titles, offices, and the seats of power',
      path: '/dignities',
      accentColor: 'accent-dignities',
      delay: 0.15
    },
    {
      iconName: 'quill',
      title: 'Writing Studio',
      subtitle: 'Draft narratives and chronicles for your world',
      path: '/writing',
      accentColor: 'accent-writing',
      delay: 0.2
    },
    {
      iconName: 'anvil',
      title: 'Data Forge',
      subtitle: 'Manage people, houses, and relationships',
      path: '/manage',
      accentColor: 'accent-forge',
      delay: 0.25
    }
  ];
  
  // ==================== RENDER ====================
  
  return (
    <>
      <Navigation />
      
      <div className="home-page">
        <div className="home-container">
          <motion.div 
            className="home-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {/* Hero Section */}
            <HeroSection features={features} />

            {/* Stats Dashboard - Shows skeletons while loading for better perceived performance */}
            <StatsGlance features={features} stats={stats} loading={isLoading} />

            {/* Quick Actions */}
            <QuickActions features={features} />
            
            {/* Recent Activity / Onboarding */}
            {/* Note: codexEntries is empty array for performance - only counts are loaded */}
            {!isLoading && (
              <RecentActivity
                features={features}
                people={people}
                houses={houses}
                codexEntries={[]}
                hasData={hasData}
              />
            )}
            
            {/* System Navigation */}
            <section className="systems-section">
              <motion.h2
                className="systems-title"
                initial={features.staggeredEntrance ? { opacity: 0, y: -10 } : false}
                animate={features.staggeredEntrance ? { opacity: 1, y: 0 } : false}
                transition={{ duration: 0.4 }}
              >
                Your Systems
              </motion.h2>
              
              <div className="systems-grid">
                {systemCards.map((card) => (
                  <SystemCard
                    key={card.path}
                    iconName={card.iconName}
                    title={card.title}
                    subtitle={card.subtitle}
                    path={card.path}
                    accentColor={card.accentColor}
                    delay={card.delay}
                    features={features}
                  />
                ))}
              </div>
            </section>
            
            {/* Footer */}
            <footer className="home-footer">
              <p>Built for worldbuilders, writers, and game masters</p>
            </footer>
          </motion.div>
        </div>
      </div>
      
    </>
  );
}
