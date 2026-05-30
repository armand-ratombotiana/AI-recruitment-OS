export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
                <span className="text-sm font-bold text-white">AI</span>
              </div>
              <span className="text-xl font-bold text-gray-900">AI-ROS</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-gray-600 hover:text-gray-900">Features</a>
              <a href="#pricing" className="text-sm text-gray-600 hover:text-gray-900">Pricing</a>
              <a href="/login" className="text-sm text-gray-600 hover:text-gray-900">Sign In</a>
              <a href="/login" className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Get Started</a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-1.5 rounded-full text-sm font-medium mb-6">
            <span className="h-2 w-2 bg-blue-500 rounded-full animate-pulse"></span>
            AI-Powered Recruitment Platform
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            Hire Smarter with
            <span className="text-blue-600"> AI-Native</span>
            <br />Recruitment OS
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Autonomous AI agents, live pair programming interviews, real-time collaboration, 
            and intelligent hiring workflows — all in one platform.
          </p>
          <div className="flex gap-4 justify-center">
            <a href="/login" className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition shadow-lg shadow-blue-600/25">
              Start Free Trial
            </a>
            <a href="#features" className="px-8 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition">
              Learn More
            </a>
          </div>
          <div className="mt-12 flex justify-center gap-12 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              Free 14-day trial
            </div>
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              No credit card required
            </div>
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              Cancel anytime
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 bg-gray-50 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Everything you need to hire better</h2>
            <p className="text-lg text-gray-600">Powered by AI, designed for humans.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { title: "AI-Powered Screening", description: "Automated candidate evaluation with multi-dimensional scoring and explainable AI reasoning.", icon: "🤖" },
              { title: "Live Pair Programming", description: "Real-time coding interviews with AI-powered evaluation and progressive hints.", icon: "💻" },
              { title: "Smart Matching", description: "Semantic candidate-job matching with AI-ranked recommendations.", icon: "🎯" },
              { title: "Recruiter Copilot", description: "AI assistant that helps you summarize candidates, compare applicants, and make decisions.", icon: "🤝" },
              { title: "Workflow Automation", description: "No-code workflow builder with event-driven automation and approval chains.", icon: "⚡" },
              { title: "Real-time Analytics", description: "Live dashboards with hiring metrics, AI performance, and workforce analytics.", icon: "📊" },
            ].map((feature, i) => (
              <div key={i} className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition">
                <div className="text-3xl mb-4">{feature.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: "10x", label: "Faster Hiring" },
              { value: "95%", label: "AI Accuracy" },
              { value: "50%", label: "Cost Reduction" },
              { value: "4.9/5", label: "User Rating" },
            ].map((stat, i) => (
              <div key={i}>
                <p className="text-4xl font-bold text-blue-600">{stat.value}</p>
                <p className="text-gray-600 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-blue-600 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to transform your hiring?</h2>
          <p className="text-blue-100 text-lg mb-8">Join hundreds of companies using AI-ROS to hire smarter.</p>
          <a href="/login" className="px-8 py-3 bg-white text-blue-600 rounded-lg font-medium hover:bg-blue-50 transition">
            Get Started Free
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-gray-100">
        <div className="max-w-7xl mx-auto text-center text-sm text-gray-500">
          <p>© 2025 AI-ROS. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
